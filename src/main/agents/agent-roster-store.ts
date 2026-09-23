import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  AgentRosterFileSchema,
  AgentSchema,
  RunSchema,
  type Agent,
  type AgentCreate,
  type AgentRosterFile,
  type AgentUpdate,
  type Run,
  type RunCreate,
  type RunStatus,
  type RunTransition,
  type RunUpdate
} from '../../shared/agent-roster'
import { withFileTransactionLock } from '../file-transaction-lock'

export const AGENT_ROSTER_FILE_NAME = 'agent-roster.json'

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ['running', 'cancelled'],
  running: ['waiting', 'succeeded', 'failed', 'cancelled'],
  waiting: ['running', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: []
}

const emptyRoster = (): AgentRosterFile => ({
  version: 1,
  agents: [],
  runs: []
})

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function validateRelationships(roster: AgentRosterFile): void {
  const agentIds = new Set<string>()
  const runIds = new Set<string>()

  for (const agent of roster.agents) {
    if (agentIds.has(agent.id)) {
      throw new Error(`Duplicate Agent id: ${agent.id}`)
    }
    agentIds.add(agent.id)
  }
  for (const run of roster.runs) {
    if (runIds.has(run.id)) {
      throw new Error(`Duplicate Run id: ${run.id}`)
    }
    if (!agentIds.has(run.agentId)) {
      throw new Error(`Run ${run.id} references a missing Agent`)
    }
    runIds.add(run.id)
  }
}

async function readRoster(filePath: string): Promise<AgentRosterFile> {
  try {
    const roster = AgentRosterFileSchema.parse(JSON.parse(await readFile(filePath, 'utf8')))
    validateRelationships(roster)
    return roster
  } catch (error) {
    if (isMissingFile(error)) {
      return emptyRoster()
    }
    throw error
  }
}

type AgentRosterStoreOptions = {
  syncDirectory?: (directory: string) => Promise<void>
}

async function syncRosterDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') {
    return
  }
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close().catch(() => undefined)
  }
}

async function persistRoster(
  filePath: string,
  roster: AgentRosterFile,
  syncDirectory: (directory: string) => Promise<void>
): Promise<void> {
  AgentRosterFileSchema.parse(roster)
  validateRelationships(roster)
  const directory = dirname(filePath)
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    await writeFile(temporaryPath, `${JSON.stringify(roster, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    const temporaryFile = await open(temporaryPath, 'r')
    await temporaryFile.sync().finally(() => temporaryFile.close())
    await rename(temporaryPath, filePath)
    await syncDirectory(directory)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
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
      await readRoster(filePath),
      options.syncDirectory ?? syncRosterDirectory
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
        createdAt: now,
        updatedAt: now
      })
      roster.agents.push(agent)
      return agent
    })
  }

  updateAgent(id: string, update: AgentUpdate): Promise<Agent> {
    return this.mutate((roster) => {
      const index = roster.agents.findIndex((agent) => agent.id === id)
      if (index === -1) {
        throw new Error(`Agent not found: ${id}`)
      }
      const agent = AgentSchema.parse({ ...roster.agents[index], ...update, updatedAt: Date.now() })
      roster.agents[index] = agent
      return agent
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
        const next = structuredClone(await readRoster(this.filePath))
        const result = change(next)
        await persistRoster(this.filePath, next, this.syncDirectory)
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
