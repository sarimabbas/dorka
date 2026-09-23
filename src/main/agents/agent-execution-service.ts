import type { Agent, Run } from '../../shared/agent-roster'
import { RunAgentParams, type RunAgentRequest } from '../../shared/rpc-contract/agent-roster-params'
import type { ComputerRuntimeInfo } from '../../shared/computer-runtime'
import type { AgentRosterStore } from './agent-roster-store'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import { resolveComputerSourceDirectory } from './managed-computer-host-projector'

export type AgentTerminalLaunch = {
  runId: string
  agent: Agent
  computer: ComputerRuntimeInfo
  computerExecutionGeneration: string
  prompt: string
  sourceDirectory: string
}

export type AgentTerminalIdentity = {
  terminalSessionId: string
  processIdentity: string
  ptyId?: string
}

export type AgentTerminalLauncher = (launch: AgentTerminalLaunch) => Promise<AgentTerminalIdentity>
export type AgentReferenceResolver = (launch: AgentTerminalLaunch) => Promise<void>

export class AgentTerminalLaunchOutcomeUnknownError extends Error {
  constructor() {
    super('Agent terminal launch outcome is unverifiable')
    this.name = 'AgentTerminalLaunchOutcomeUnknownError'
  }
}

export class AgentExecutionService {
  constructor(
    private readonly roster: AgentRosterStore,
    private readonly computers: Pick<
      ComputerRuntimeManager,
      'getExecutionGeneration' | 'inspect' | 'start'
    >,
    private readonly launchTerminal: AgentTerminalLauncher,
    private readonly onTerminalCommitted?: (runId: string, ptyId: string) => void,
    private readonly resolveReferences?: AgentReferenceResolver
  ) {}

  canResolveReferences(): boolean {
    return this.resolveReferences !== undefined
  }

  async run(request: RunAgentRequest): Promise<Run> {
    const validated = RunAgentParams.parse(request)
    if (!this.roster.getAgent(validated.agentId)) {
      throw new Error(`Agent not found: ${validated.agentId}`)
    }

    let computer = await this.computers.inspect(validated.computerId)
    const computerExecutionGeneration = await this.computers.getExecutionGeneration(computer.id)
    const { agent, run } = await this.roster.createRunForAgent(validated.agentId, (current) => ({
      computerId: computer.id,
      computerExecutionGeneration,
      prompt: `${current.promptTemplate}\n\n${validated.prompt}`,
      sourceDirectory: resolveComputerSourceDirectory(current.workingDirectory)
    }))
    const launch = {
      runId: run.id,
      agent,
      computer,
      computerExecutionGeneration,
      prompt: run.prompt,
      sourceDirectory: run.sourceDirectory ?? '/workspace'
    }
    if (agent.references.items.length > 0 && !this.resolveReferences) {
      const error = new Error('Agent requirements cannot be resolved by this Dorka Server')
      await this.failQueuedRun(run.id, error)
      throw error
    }
    try {
      if (computer.state !== 'running') {
        computer = await this.computers.start(computer.id)
        launch.computer = computer
      }
      if (agent.references.items.length > 0) {
        await this.resolveReferences?.(launch)
      }
    } catch (error) {
      await this.failQueuedRun(run.id, error)
      throw error
    }

    await this.roster.transitionRun(run.id, { status: 'running' })
    let identity: AgentTerminalIdentity
    try {
      identity = await this.launchTerminal(launch)
    } catch (error) {
      if (error instanceof AgentTerminalLaunchOutcomeUnknownError) {
        return this.roster.transitionRun(run.id, { status: 'waiting' })
      }
      const message = error instanceof Error ? error.message : String(error)
      await this.roster.transitionRun(run.id, {
        status: 'failed',
        error: message || 'Agent terminal launch failed'
      })
      throw error
    }

    // A successful launch may already be live. Persistence failure must not claim it exited.
    const committed = await this.roster.updateRun(run.id, identity)
    if (identity.ptyId) {
      this.onTerminalCommitted?.(run.id, identity.ptyId)
    }
    return committed
  }

  private async failQueuedRun(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    await this.roster.transitionRun(runId, {
      status: 'failed',
      error: message || 'Agent launch preparation failed'
    })
  }
}
