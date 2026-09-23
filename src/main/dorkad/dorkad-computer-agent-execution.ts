import type { Store } from '../persistence'
import type { Run } from '../../shared/agent-roster'
import {
  AgentExecutionService,
  type AgentReferenceResolver
} from '../agents/agent-execution-service'
import { createManagedComputerAgentTerminalLauncher } from '../agents/managed-computer-agent-terminal-launcher'
import { createComputerAgentReferenceResolver } from '../agents/computer-agent-reference-resolver'
import { ComputerRunSourceControl } from '../agents/computer-run-source-control'
import {
  createManagedComputerHostProjector,
  type ManagedComputerHostProjector
} from '../agents/managed-computer-host-projector'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import { ComputerGitIdentityManager } from '../computers/computer-git-identity'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import {
  ManagedSshHostSessions,
  type ManagedSshHostConnection
} from '../ssh/managed-ssh-host-sessions'
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
  let referenceAuthority: AgentReferenceResolver | null = null
  let sourceControlAuthority: ComputerRunSourceControl | null = null
  let gitIdentityAuthority: ComputerGitIdentityManager | null = null
  let runExitObserver: ManagedRunPtyExitObserver | null = null
  let runtimeAuthority: Pick<DorkaRuntimeService, 'getExactTerminalPtyId'> | null = null
  const service = new AgentExecutionService(
    agents,
    computers,
    (request) => launch(request),
    (runId, ptyId) => runExitObserver?.observe(runId, ptyId),
    (request) => requireReferenceResolver(referenceAuthority)(request)
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
      runtimeAuthority = runtime
      sessions = new ManagedSshHostSessions({
        store,
        runtime,
        onReconnectReady: (connectionId, connection) =>
          reconcileReconnectedManagedComputerRuns({
            agents,
            connection,
            connectionId,
            runExitObserver,
            runtime: runtimeAuthority
          })
      })
      host = createManagedComputerHostProjector({ computers, sessions })
      referenceAuthority = createComputerAgentReferenceResolver({ host })
      launch = createManagedComputerAgentTerminalLauncher({ host, runtime })
      sourceControlAuthority = new ComputerRunSourceControl({
        roster: agents,
        computers,
        host
      })
      gitIdentityAuthority = new ComputerGitIdentityManager({ computers, host })
    },
    async recoverPersistedRunHosts(): Promise<DorkadManagedRunRecoveryResult> {
      const result = await recoverPersistedManagedComputerRunHosts({
        agents,
        computers,
        host,
        runExitObserver,
        runtime: runtimeAuthority
      })
      reportManagedRunRecovery(result)
      return result
    },
    async disconnectAll(): Promise<void> {
      runExitObserver?.dispose()
      runExitObserver = null
      runtimeAuthority = null
      referenceAuthority = null
      await sessions?.disconnectAll()
    }
  }
}

export async function reconcileReconnectedManagedComputerRuns(options: {
  agents: Pick<AgentRosterStore, 'listRuns'>
  connection: ManagedSshHostConnection
  connectionId: string
  runExitObserver: Pick<ManagedRunPtyExitObserver, 'reconcileAfterConnect'> | null
  runtime: Pick<DorkaRuntimeService, 'getExactTerminalPtyId'> | null
}): Promise<void> {
  const prefix = 'runtime-ssh-computer-'
  if (!options.connectionId.startsWith(prefix) || !options.runExitObserver || !options.runtime) {
    return
  }
  const computerId = options.connectionId.slice(prefix.length)
  if (!computerId) {
    return
  }
  const runs = options.agents.listRuns().filter((run) => run.computerId === computerId)
  if (!runs.some((run) => run.status === 'running' || run.status === 'waiting')) {
    return
  }
  await options.runExitObserver.reconcileAfterConnect(
    { connectionId: options.connectionId, ...options.connection },
    runs,
    options.runtime
  )
}

export async function recoverPersistedManagedComputerRunHosts(options: {
  agents: Pick<AgentRosterStore, 'listRuns'>
  computers: Pick<ComputerRuntimeManager, 'list'>
  host: Pick<ManagedComputerHostProjector, 'connect'> | null
  runExitObserver?: Pick<ManagedRunPtyExitObserver, 'reconcileAfterConnect'> | null
  runtime?: Pick<DorkaRuntimeService, 'getExactTerminalPtyId'> | null
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

  const persistedRuns = options.agents.listRuns()
  const runsByComputer = new Map<string, Run[]>()
  for (const run of persistedRuns) {
    if (
      (run.status !== 'running' && run.status !== 'waiting') ||
      !runningComputerIds.has(run.computerId)
    ) {
      continue
    }
    const runs = runsByComputer.get(run.computerId) ?? []
    runs.push(run)
    runsByComputer.set(run.computerId, runs)
  }

  const recoveredComputerIds: string[] = []
  const failedComputerIds: string[] = []
  for (const [computerId] of runsByComputer) {
    let connection
    try {
      connection = await options.host.connect(computerId)
    } catch {
      failedComputerIds.push(computerId)
      continue
    }
    recoveredComputerIds.push(computerId)
    if (options.runExitObserver && options.runtime) {
      const computerRuns = persistedRuns.filter((run) => run.computerId === computerId)
      await options.runExitObserver
        .reconcileAfterConnect(connection, computerRuns, options.runtime)
        .catch(() => undefined)
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

function requireReferenceResolver(
  authority: AgentReferenceResolver | null
): AgentReferenceResolver {
  if (!authority) {
    throw new Error('Computer Agent requirements are unavailable')
  }
  return authority
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
