import type { Store } from '../persistence'
import { AgentExecutionService } from '../agents/agent-execution-service'
import { createManagedComputerAgentTerminalLauncher } from '../agents/managed-computer-agent-terminal-launcher'
import { ComputerRunSourceControl } from '../agents/computer-run-source-control'
import {
  createManagedComputerHostProjector,
  type ManagedComputerHostProjector
} from '../agents/managed-computer-host-projector'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import { ComputerGitIdentityManager } from '../computers/computer-git-identity'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import { ManagedSshHostSessions } from '../ssh/managed-ssh-host-sessions'
import { ManagedRunPtyExitObserver } from './managed-run-pty-exit-observer'

export type DorkadManagedRunRecoveryResult = {
  recoveredComputerIds: string[]
  failedComputerIds: string[]
  unavailableReason?: 'managed-host-not-attached' | 'computer-list-failed'
}

export function createDorkadComputerAgentExecution(
  agents: AgentRosterStore,
  computers: ComputerRuntimeManager
) {
  let sessions: ManagedSshHostSessions | null = null
  let host: ManagedComputerHostProjector | null = null
  let launch = createUnavailableLauncher()
  let sourceControlAuthority: ComputerRunSourceControl | null = null
  let gitIdentityAuthority: ComputerGitIdentityManager | null = null
  let runExitObserver: ManagedRunPtyExitObserver | null = null
  const service = new AgentExecutionService(
    agents,
    computers,
    (request) => launch(request),
    (runId, ptyId) => runExitObserver?.observe(runId, ptyId)
  )
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
      runExitObserver?.dispose()
      runExitObserver = new ManagedRunPtyExitObserver(agents, runtime)
      sessions = new ManagedSshHostSessions({ store, runtime })
      host = createManagedComputerHostProjector({ computers, sessions })
      launch = createManagedComputerAgentTerminalLauncher({ host, runtime })
      sourceControlAuthority = new ComputerRunSourceControl({
        roster: agents,
        computers,
        host
      })
      gitIdentityAuthority = new ComputerGitIdentityManager({ computers, host })
    },
    async recoverPersistedRunHosts(): Promise<DorkadManagedRunRecoveryResult> {
      const result = await recoverPersistedManagedComputerRunHosts({ agents, computers, host })
      reportManagedRunRecovery(result)
      return result
    },
    async disconnectAll(): Promise<void> {
      runExitObserver?.dispose()
      runExitObserver = null
      await sessions?.disconnectAll()
    }
  }
}

export async function recoverPersistedManagedComputerRunHosts(options: {
  agents: Pick<AgentRosterStore, 'listRuns'>
  computers: Pick<ComputerRuntimeManager, 'list'>
  host: Pick<ManagedComputerHostProjector, 'connect'> | null
}): Promise<DorkadManagedRunRecoveryResult> {
  if (!options.host) {
    return {
      recoveredComputerIds: [],
      failedComputerIds: [],
      unavailableReason: 'managed-host-not-attached'
    }
  }

  let runningComputerIds: Set<string>
  try {
    runningComputerIds = new Set(
      (await options.computers.list())
        .filter((computer) => computer.state === 'running')
        .map((computer) => computer.id)
    )
  } catch {
    return {
      recoveredComputerIds: [],
      failedComputerIds: [],
      unavailableReason: 'computer-list-failed'
    }
  }

  const computerIds = new Set(
    options.agents
      .listRuns()
      .filter((run) => run.status === 'running' || run.status === 'waiting')
      .map((run) => run.computerId)
      .filter((computerId) => runningComputerIds.has(computerId))
  )
  const recoveredComputerIds: string[] = []
  const failedComputerIds: string[] = []
  for (const computerId of computerIds) {
    try {
      await options.host.connect(computerId)
      recoveredComputerIds.push(computerId)
    } catch {
      failedComputerIds.push(computerId)
    }
  }
  return { recoveredComputerIds, failedComputerIds }
}

function reportManagedRunRecovery(result: DorkadManagedRunRecoveryResult): void {
  if (result.unavailableReason) {
    console.error(
      `[dorkad] Managed Computer Run recovery is degraded: ${result.unavailableReason}.`
    )
  } else if (result.failedComputerIds.length > 0) {
    console.error(
      `[dorkad] Managed Computer Run recovery is degraded for Computers: ${result.failedComputerIds.join(', ')}`
    )
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
