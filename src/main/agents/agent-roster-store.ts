import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  AgentSchema,
  RunSchema,
  type Agent,
  type AgentCreate,
  type AgentRosterFile,
  type AgentUpdate,
  type AgentUpdateResult,
  type Run,
  type RunCreate,
  type RunStatus,
  type RunTransition,
  type RunUpdate
} from '../../shared/agent-roster'
import { withFileTransactionLock } from '../file-transaction-lock'
import {
  persistAgentRoster,
  readAgentRoster,
  syncAgentRosterDirectory
} from './agent-roster-persistence'

export const AGENT_ROSTER_FILE_NAME = 'agent-roster.json'

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ['running', 'cancelled'],
  running: ['waiting', 'succeeded', 'failed', 'cancelled'],
  waiting: ['running', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: []
}

type AgentRosterStoreOptions = {
  syncDirectory?: (directory: string) => Promise<void>
}

export class AgentRosterStore {
  private queue = Promise.resolve()

  private constructor(
    private readonly filePath: string,
    private roster: AgentRosterFile,
    private readonly syncDirectory: (directory: string) => Promise<void>
  ) {}

  static async open(
    directory: string,
    options: AgentRosterStoreOptions = {}
  ): Promise<AgentRosterStore> {
    const filePath = join(directory, AGENT_ROSTER_FILE_NAME)
    return new AgentRosterStore(
      filePath,
      await readAgentRoster(filePath),
      options.syncDirectory ?? syncAgentRosterDirectory
    )
  }

  getAgent(id: string): Agent | null {
    return this.roster.agents.find((agent) => agent.id === id) ?? null
  }

  listAgents(): Agent[] {
    return [...this.roster.agents]
  }

  createAgent(input: AgentCreate): Promise<Agent> {
    return this.mutate((roster) => {
      const now = Date.now()
      const agent = AgentSchema.parse({
        ...input,
        id: randomUUID(),
        revision: 1,
        references: input.references ?? { version: 1, items: [] },
        createdAt: now,
        updatedAt: now
      })
      roster.agents.push(agent)
      return agent
    })
  }

  updateAgent(
    id: string,
    expectedRevision: number,
    update: AgentUpdate
  ): Promise<AgentUpdateResult> {
    return this.mutate((roster) => {
      const index = roster.agents.findIndex((agent) => agent.id === id)
      if (index === -1) {
        throw new Error(`Agent not found: ${id}`)
      }
      const current = roster.agents[index]
      if (current.revision !== expectedRevision) {
        return { outcome: 'conflict', currentRevision: current.revision }
      }
      const agent = AgentSchema.parse({
        ...current,
        ...update,
        revision: current.revision + 1,
        updatedAt: Date.now()
      })
      roster.agents[index] = agent
      return { outcome: 'updated', agent }
    })
  }

  moveAgent(id: string, computerId: string): Promise<Agent> {
    return this.mutate((roster) => {
      const index = roster.agents.findIndex((agent) => agent.id === id)
      if (index === -1) {
        throw new Error(`Agent not found: ${id}`)
      }
      const agent = AgentSchema.parse({
        ...roster.agents[index],
        lastComputerId: computerId,
        revision: roster.agents[index].revision + 1,
        updatedAt: Date.now()
      })
      roster.agents[index] = agent
      return agent
    })
  }

  getRun(id: string): Run | null {
    return this.roster.runs.find((run) => run.id === id) ?? null
  }

  listRuns(filter: { agentId?: string } = {}): Run[] {
    return this.roster.runs.filter(
      (run) => filter.agentId === undefined || run.agentId === filter.agentId
    )
  }

  createRun(input: RunCreate): Promise<Run> {
    return this.mutate((roster) => {
      if (!roster.agents.some((agent) => agent.id === input.agentId)) {
        throw new Error(`Agent not found: ${input.agentId}`)
      }
      const run = RunSchema.parse({
        ...input,
        id: randomUUID(),
        status: 'queued',
        createdAt: Date.now()
      })
      roster.runs.push(run)
      return run
    })
  }

  updateRun(id: string, update: RunUpdate): Promise<Run> {
    return this.mutate((roster) => {
      const index = roster.runs.findIndex((run) => run.id === id)
      if (index === -1) {
        throw new Error(`Run not found: ${id}`)
      }
      const current = roster.runs[index]
      const run = RunSchema.parse({
        ...current,
        terminalSessionId: update.terminalSessionId ?? current.terminalSessionId,
        processIdentity: update.processIdentity ?? current.processIdentity
      })
      roster.runs[index] = run
      return run
    })
  }

  transitionRunningRunToWaiting(id: string): Promise<Run> {
    const current = this.getRun(id)
    if (!current) {
      return Promise.reject(new Error(`Run not found: ${id}`))
    }
    return this.transitionRunningRunToWaitingIfIdentity(id, {
      computerId: current.computerId,
      computerExecutionGeneration: current.computerExecutionGeneration,
      terminalSessionId: current.terminalSessionId,
      processIdentity: current.processIdentity
    })
  }

  transitionRunningRunToWaitingIfIdentity(
    id: string,
    expected: Pick<
      Run,
      'computerId' | 'computerExecutionGeneration' | 'terminalSessionId' | 'processIdentity'
    >
  ): Promise<Run> {
    const known = this.getRun(id)
    if (!known) {
      return Promise.reject(new Error(`Run not found: ${id}`))
    }
    // Terminal states cannot transition back to running. Avoid an unnecessary file transaction for
    // late duplicate exit notifications; callers deliberately do not await live PTY callbacks.
    if (known.status !== 'running') {
      return Promise.resolve(known)
    }
    return this.mutate((roster) => {
      const index = roster.runs.findIndex((run) => run.id === id)
      if (index === -1) {
        throw new Error(`Run not found: ${id}`)
      }
      const current = roster.runs[index]
      if (
        current.status !== 'running' ||
        current.computerId !== expected.computerId ||
        current.computerExecutionGeneration !== expected.computerExecutionGeneration ||
        current.terminalSessionId !== expected.terminalSessionId ||
        current.processIdentity !== expected.processIdentity
      ) {
        return current
      }
      const run = RunSchema.parse({ ...current, status: 'waiting' })
      roster.runs[index] = run
      return run
    })
  }

  transitionRun(id: string, transition: RunTransition): Promise<Run> {
    return this.mutate((roster) => {
      const index = roster.runs.findIndex((run) => run.id === id)
      if (index === -1) {
        throw new Error(`Run not found: ${id}`)
      }
      const current = roster.runs[index]
      if (!transitions[current.status].includes(transition.status)) {
        throw new Error(`Invalid Run transition: ${current.status} -> ${transition.status}`)
      }
      if (transition.result !== undefined && transition.status !== 'succeeded') {
        throw new Error('Only a succeeded Run can record a result')
      }
      if (transition.error !== undefined && transition.status !== 'failed') {
        throw new Error('Only a failed Run can record an error')
      }
      const now = Date.now()
      const finished = ['succeeded', 'failed', 'cancelled'].includes(transition.status)
      const run = RunSchema.parse({
        ...current,
        ...transition,
        startedAt: current.startedAt ?? (transition.status === 'running' ? now : undefined),
        finishedAt: finished ? now : undefined
      })
      roster.runs[index] = run
      return run
    })
  }

  private mutate<T>(change: (roster: AgentRosterFile) => T): Promise<T> {
    const operation = this.queue.then(() =>
      withFileTransactionLock(this.filePath, async () => {
        // Why: another dorkad process or store instance may have committed since this instance
        // opened. Mutate the latest durable snapshot under the shared lock instead of overwriting it
        // with this instance's stale in-memory copy.
        const next = structuredClone(await readAgentRoster(this.filePath))
        const result = change(next)
        await persistAgentRoster(this.filePath, next, this.syncDirectory)
        this.roster = next
        return result
      })
    )
    this.queue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }
}
