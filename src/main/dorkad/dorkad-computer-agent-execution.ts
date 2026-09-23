import type { Store } from '../persistence'
import { AgentExecutionService } from '../agents/agent-execution-service'
import { createManagedComputerAgentTerminalLauncher } from '../agents/managed-computer-agent-terminal-launcher'
import { ComputerRunSourceControl } from '../agents/computer-run-source-control'
import { createManagedComputerHostProjector } from '../agents/managed-computer-host-projector'
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
  let sourceControlAuthority: ComputerRunSourceControl | null = null
  const service = new AgentExecutionService(agents, computers, (request) => launch(request))
  const sourceControl = {
    status: (runId: string) => requireSourceControl(sourceControlAuthority).status(runId),
    diff: (request: Parameters<ComputerRunSourceControl['diff']>[0]) =>
      requireSourceControl(sourceControlAuthority).diff(request),
    review: (request: Parameters<ComputerRunSourceControl['review']>[0]) =>
      requireSourceControl(sourceControlAuthority).review(request),
    reviewDiff: (request: Parameters<ComputerRunSourceControl['reviewDiff']>[0]) =>
      requireSourceControl(sourceControlAuthority).reviewDiff(request)
  }

  return {
    service,
    sourceControl,
    attach(store: Store, runtime: DorkaRuntimeService): void {
      sessions = new ManagedSshHostSessions({ store, runtime })
      const host = createManagedComputerHostProjector({ computers, sessions })
      launch = createManagedComputerAgentTerminalLauncher({ host, runtime })
      sourceControlAuthority = new ComputerRunSourceControl({
        roster: agents,
        computers,
        host
      })
    },
    async disconnectAll(): Promise<void> {
      await sessions?.disconnectAll()
    }
  }
}

function requireSourceControl(
  authority: ComputerRunSourceControl | null
): ComputerRunSourceControl {
  if (!authority) {
    throw new Error('Computer Run source control is unavailable')
  }
  return authority
}

function createUnavailableLauncher(): ReturnType<
  typeof createManagedComputerAgentTerminalLauncher
> {
  return async () => {
    throw new Error('Computer agent execution is unavailable')
  }
}
