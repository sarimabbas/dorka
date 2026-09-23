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
  prompt: string
}

export type AgentTerminalIdentity = {
  terminalSessionId: string
  processIdentity: string
}

export type AgentTerminalLauncher = (launch: AgentTerminalLaunch) => Promise<AgentTerminalIdentity>

export class AgentTerminalLaunchOutcomeUnknownError extends Error {
  constructor() {
    super('Agent terminal launch outcome is unverifiable')
    this.name = 'AgentTerminalLaunchOutcomeUnknownError'
  }
}

export class AgentExecutionService {
  constructor(
    private readonly roster: AgentRosterStore,
    private readonly computers: Pick<ComputerRuntimeManager, 'inspect' | 'start'>,
    private readonly launchTerminal: AgentTerminalLauncher
  ) {}

  async run(request: RunAgentRequest): Promise<Run> {
    const validated = RunAgentParams.parse(request)
    const agent = this.roster.getAgent(validated.agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${validated.agentId}`)
    }

    let computer = await this.computers.inspect(validated.computerId)
    const run = await this.roster.createRun({
      agentId: agent.id,
      computerId: computer.id,
      prompt: validated.prompt,
      sourceDirectory: resolveComputerSourceDirectory(agent.workingDirectory)
    })
    await this.roster.transitionRun(run.id, { status: 'running' })

    let identity: AgentTerminalIdentity
    try {
      if (computer.state !== 'running') {
        computer = await this.computers.start(computer.id)
      }
      identity = await this.launchTerminal({
        runId: run.id,
        agent,
        computer,
        prompt: validated.prompt
      })
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
    return this.roster.updateRun(run.id, identity)
  }
}
