import { installRuntimeLinearCommandSurface } from './runtime-linear-command-surface'
import { DorkaRuntimeWithResolveWaiter } from './dorka-runtime-resolve-waiter'
import type { RuntimeCommandSurfaceHost } from './dorka-runtime-core'
import { registerWorktreeChangeInvalidator } from '../ipc/worktree-change-invalidators'
import { registerDetectedWorktreeScanInvalidation } from '../ipc/worktrees/listing/register-detected-worktree-scan-invalidation'
import type { AgentCreate } from '../../shared/agent-roster'
import type { RunAgentRequest } from '../../shared/rpc-contract/agent-roster-params'
import type { ComputerCreateSpec } from '../../shared/computer-runtime'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import type { AgentExecutionService } from '../agents/agent-execution-service'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'

type BaseRuntimeConstructorParams = ConstructorParameters<typeof DorkaRuntimeWithResolveWaiter>
type BaseRuntimeDependencies = NonNullable<BaseRuntimeConstructorParams[2]>

export type DorkaLifecycleRpcDependencies = {
  agentRosterStore?: AgentRosterStore
  agentExecutionService?: AgentExecutionService
  computerRuntimeManager?: ComputerRuntimeManager
}

type DorkaRuntimeDependencies = BaseRuntimeDependencies & DorkaLifecycleRpcDependencies

class DorkaRuntimeService extends DorkaRuntimeWithResolveWaiter {
  private readonly agentRosterStore?: AgentRosterStore
  private readonly agentExecutionService?: AgentExecutionService
  private readonly computerRuntimeManager?: ComputerRuntimeManager
  private computerMutationQueue = Promise.resolve()

  constructor(
    store: BaseRuntimeConstructorParams[0] = null,
    stats?: BaseRuntimeConstructorParams[1],
    deps?: DorkaRuntimeDependencies
  ) {
    super(store, stats, deps)
    this.agentRosterStore = deps?.agentRosterStore
    this.agentExecutionService = deps?.agentExecutionService
    this.computerRuntimeManager = deps?.computerRuntimeManager
    // Why: the runtime listing re-runs a scan the worktree-change generation overtook and re-lists
    // through this runtime's scan cache, so a worktree change must reach both. The desktop IPC
    // module registers the generation bump at load; a headless host never loads it.
    registerDetectedWorktreeScanInvalidation()
    registerWorktreeChangeInvalidator((repoId) => this.invalidateWorktreeCatalog(repoId))
  }

  listRosterAgents() {
    return this.requireAgentRosterStore().listAgents()
  }

  createRosterAgent(input: AgentCreate) {
    return this.requireAgentRosterStore().createAgent(input)
  }

  moveRosterAgent(agentId: string, computerId: string) {
    return this.runComputerMutation(async (manager) => {
      const computers = await manager.list()
      if (!computers.some((computer) => computer.id === computerId)) {
        throw new Error(`Computer not found: ${computerId}`)
      }
      return this.requireAgentRosterStore().moveAgent(agentId, computerId)
    })
  }

  runRosterAgent(request: RunAgentRequest) {
    if (!this.agentExecutionService) {
      throw new Error('Agent execution is unavailable')
    }
    return this.agentExecutionService.run(request)
  }

  listRuntimeComputers() {
    return this.requireComputerRuntimeManager().list()
  }

  createRuntimeComputer(spec: ComputerCreateSpec) {
    return this.runComputerMutation((manager) => manager.create(spec))
  }

  startRuntimeComputer(id: string) {
    return this.runComputerMutation((manager) => manager.start(id))
  }

  stopRuntimeComputer(id: string) {
    return this.runComputerMutation((manager) => manager.stop(id))
  }

  removeRuntimeComputer(id: string) {
    return this.runComputerMutation((manager) => manager.remove(id))
  }

  private requireAgentRosterStore(): AgentRosterStore {
    if (!this.agentRosterStore) {
      throw new Error('Agent roster is unavailable')
    }
    return this.agentRosterStore
  }

  private requireComputerRuntimeManager(): ComputerRuntimeManager {
    if (!this.computerRuntimeManager) {
      throw new Error('Computer runtime is unavailable')
    }
    return this.computerRuntimeManager
  }

  private runComputerMutation<T>(
    operation: (manager: ComputerRuntimeManager) => Promise<T>
  ): Promise<T> {
    const pending = this.computerMutationQueue.then(() =>
      operation(this.requireComputerRuntimeManager())
    )
    this.computerMutationQueue = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }
}
type DorkaRuntimeServiceExport = RuntimeCommandSurfaceHost<DorkaRuntimeService>
const DorkaRuntimeServiceExport = DorkaRuntimeService as unknown as {
  new (...args: ConstructorParameters<typeof DorkaRuntimeService>): DorkaRuntimeServiceExport
  readonly prototype: DorkaRuntimeServiceExport
}
export { DorkaRuntimeServiceExport as DorkaRuntimeService }
installRuntimeLinearCommandSurface(DorkaRuntimeServiceExport.prototype)

export type { LegacyWorkerTerminalRecoveryResult } from './runtime-legacy-worker-terminal-recovery-types'
export type {
  RuntimeAutomationCreateInput,
  RuntimeAutomationUpdateInput
} from './runtime-automation-controller'
export type { SubscriptionRegistration } from './runtime-subscription-registry'
export type {
  OrchestrationCompatibilityCallerAuthority,
  OrchestrationCompatibilityTerminalAuthority,
  RuntimePtyDataAdmission,
  RuntimeTerminalAgentStatusEvent
} from './runtime-terminal-contracts'
export type { MessageWaitResult } from './runtime-message-waiters'
export type { AccountsSnapshot, CodexRateLimitResetRpcResult } from './runtime-account-controller'
export type {
  MobileNotificationDispatchEvent,
  MobileNotificationDismissEvent,
  MobileNotificationEvent
} from './runtime-mobile-notification-controller'
export type { RuntimeTerminalDataMeta } from './runtime-terminal-stream-consumers'
export type { RemoteFetchResult, RemoteTrackingBase } from './runtime-remote-fetch-controller'
export {
  computeTerminalTailWaitState,
  tailGainedNewerBlockedReason,
  type TerminalTailWaitState
} from './terminal-wait-tail-state'
export { appendNormalizedToTailBuffer } from './terminal-tail-buffer'
export { appendNormalizedToMultilineTailBufferUnwindowed } from './terminal-tail-redraw-buffer'
export { buildPreview } from './terminal-tail-state'
export { buildRestoredTerminalTailSeed } from './terminal-tail-restore-seed'
export { projectTerminalTailLines } from './dorka-runtime-terminal-projection'
export { resolveWorktreeScanCacheTtlMs } from './runtime-worktree-scan-cache'
export type {
  RuntimeWorktreeLifecycleEvent,
  DriverState,
  PtyLayoutTarget,
  PtyLayoutState,
  ApplyLayoutResult,
  RuntimeRendererReloadFence
} from './dorka-runtime-core'
export {
  AUTHORITATIVE_TERMINAL_SNAPSHOT_TIMEOUT_MS,
  WORKTREE_SCAN_ADMIN_RECONCILE_INTERVAL_MS,
  WORKTREE_SCAN_ADMIN_FINGERPRINT_TIMEOUT_MS
} from './dorka-runtime-postlude'
