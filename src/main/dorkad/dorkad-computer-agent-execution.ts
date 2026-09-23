import type { Store } from '../persistence'
import { AgentExecutionService } from '../agents/agent-execution-service'
import { createManagedComputerAgentTerminalLauncher } from '../agents/managed-computer-agent-terminal-launcher'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import { ManagedSshHostSessions } from '../ssh/managed-ssh-host-sessions'

export function createDorkadComputerAgentExecution(
  agents: AgentRosterStore,
  computers: ComputerRuntimeManager
) {
  let sessions: ManagedSshHostSessions | null = null
  let launch = createUnavailableLauncher()
  const service = new AgentExecutionService(agents, computers, (request) => launch(request))

  return {
    service,
    attach(store: Store, runtime: DorkaRuntimeService): void {
      sessions = new ManagedSshHostSessions({ store, runtime })
      launch = createManagedComputerAgentTerminalLauncher({ computers, runtime, sessions })
    },
    async disconnectAll(): Promise<void> {
      await sessions?.disconnectAll()
    }
  }
}

function createUnavailableLauncher(): ReturnType<
  typeof createManagedComputerAgentTerminalLauncher
> {
  return async () => {
    throw new Error('Computer agent execution is unavailable')
  }
}
