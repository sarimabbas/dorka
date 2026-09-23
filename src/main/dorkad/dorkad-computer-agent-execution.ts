import type { Store } from '../persistence'
import { AgentExecutionService } from '../agents/agent-execution-service'
import { createManagedComputerAgentTerminalLauncher } from '../agents/managed-computer-agent-terminal-launcher'
import { ComputerRunSourceControl } from '../agents/computer-run-source-control'
import { createManagedComputerHostProjector } from '../agents/managed-computer-host-projector'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import { ComputerGitIdentityManager } from '../computers/computer-git-identity'
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
  let gitIdentityAuthority: ComputerGitIdentityManager | null = null
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

  const gitIdentity = {
    get: (computerId: string) => requireGitIdentity(gitIdentityAuthority).get(computerId),
    set: (computerId: string, identity: Parameters<ComputerGitIdentityManager['set']>[1]) =>
      requireGitIdentity(gitIdentityAuthority).set(computerId, identity)
  }

  return {
    runtimeDependencies: {
      agentExecutionService: service,
      computerRunSourceControl: sourceControl,
      computerGitIdentity: gitIdentity
    },
    attach(store: Store, runtime: DorkaRuntimeService): void {
      sessions = new ManagedSshHostSessions({ store, runtime })
      const host = createManagedComputerHostProjector({ computers, sessions })
      launch = createManagedComputerAgentTerminalLauncher({ host, runtime })
      sourceControlAuthority = new ComputerRunSourceControl({
        roster: agents,
        computers,
        host
      })
      gitIdentityAuthority = new ComputerGitIdentityManager({ computers, host })
    },
    async disconnectAll(): Promise<void> {
      await sessions?.disconnectAll()
    }
  }
}

function requireGitIdentity(
  authority: ComputerGitIdentityManager | null
): ComputerGitIdentityManager {
  if (!authority) {
    throw new Error('Computer Git identity is unavailable')
  }
  return authority
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
