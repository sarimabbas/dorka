import { installRuntimeLinearCommandSurface } from './runtime-linear-command-surface'
import { DorkaRuntimeWithResolveWaiter } from './dorka-runtime-resolve-waiter'
import type { RuntimeCommandSurfaceHost } from './dorka-runtime-core'
import { registerWorktreeChangeInvalidator } from '../ipc/worktree-change-invalidators'
import { registerDetectedWorktreeScanInvalidation } from '../ipc/worktrees/listing/register-detected-worktree-scan-invalidation'
import type { AgentCreate, AgentReferenceSet } from '../../shared/agent-roster'
import type {
  ListRunsRequest,
  RunAgentRequest
} from '../../shared/rpc-contract/agent-roster-params'
import type {
  AgentSourceControlDiffRequest,
  AgentSourceControlReviewDiffRequest,
  AgentSourceControlReviewRequest
} from '../../shared/rpc-contract/agent-source-control-params'
import type {
  ComputerConfigurationInput,
  ComputerCreateSpec,
  ComputerDesiredState
} from '../../shared/computer-runtime'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import type { AgentExecutionService } from '../agents/agent-execution-service'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import type { ComputerRunSourceControlService } from '../agents/computer-run-source-control'
import type { ComputerGitIdentityService } from '../computers/computer-git-identity'
import {
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  AGENT_REFERENCES_RUNTIME_CAPABILITY,
  AGENT_ROSTER_RUNTIME_CAPABILITY,
  AGENT_RUN_HISTORY_RUNTIME_CAPABILITY,
  AGENT_SOURCE_CONTROL_RUNTIME_CAPABILITY,
  COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY,
  COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '../../shared/protocol-version'

type BaseRuntimeConstructorParams = ConstructorParameters<typeof DorkaRuntimeWithResolveWaiter>
type BaseRuntimeDependencies = NonNullable<BaseRuntimeConstructorParams[2]>

export type DorkaLifecycleRpcDependencies = {
  agentRosterStore?: AgentRosterStore
  agentExecutionService?: AgentExecutionService
  computerRuntimeManager?: ComputerRuntimeManager
  computerRunSourceControl?: ComputerRunSourceControlService
  computerGitIdentity?: ComputerGitIdentityService
}

type DorkaRuntimeDependencies = BaseRuntimeDependencies & DorkaLifecycleRpcDependencies

function withLifecycleCapabilityHonesty(
  deps: DorkaRuntimeDependencies | undefined
): DorkaRuntimeDependencies {
  const disabled = new Set<RuntimeCapability>(deps?.disabledRuntimeCapabilities)
  if (!deps?.agentRosterStore) {
    disabled.add(AGENT_ROSTER_RUNTIME_CAPABILITY)
    disabled.add(AGENT_RUN_HISTORY_RUNTIME_CAPABILITY)
  }
  if (!deps?.agentExecutionService) {
    disabled.add(AGENT_EXECUTION_RUNTIME_CAPABILITY)
  }
  if (!deps?.agentRosterStore || !deps.agentExecutionService?.canResolveReferences()) {
    disabled.add(AGENT_REFERENCES_RUNTIME_CAPABILITY)
  }
  if (!deps?.computerRuntimeManager) {
    disabled.add(COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY)
    disabled.add(COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY)
  }
  if (!deps?.computerRunSourceControl) {
    disabled.add(AGENT_SOURCE_CONTROL_RUNTIME_CAPABILITY)
  }
  if (!deps?.computerGitIdentity) {
    disabled.add(COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY)
  }
  return { ...deps, disabledRuntimeCapabilities: [...disabled] }
}

class DorkaRuntimeService extends DorkaRuntimeWithResolveWaiter {
  private readonly agentRosterStore?: AgentRosterStore
  private readonly agentExecutionService?: AgentExecutionService
  private readonly computerRuntimeManager?: ComputerRuntimeManager
  private readonly computerRunSourceControl?: ComputerRunSourceControlService
  private readonly computerGitIdentity?: ComputerGitIdentityService

  constructor(
    store: BaseRuntimeConstructorParams[0] = null,
    stats?: BaseRuntimeConstructorParams[1],
    deps?: DorkaRuntimeDependencies
  ) {
    super(store, stats, withLifecycleCapabilityHonesty(deps))
    this.agentRosterStore = deps?.agentRosterStore
    this.agentExecutionService = deps?.agentExecutionService
    this.computerRuntimeManager = deps?.computerRuntimeManager
    this.computerRunSourceControl = deps?.computerRunSourceControl
    this.computerGitIdentity = deps?.computerGitIdentity
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

  updateRosterAgentReferences(
    agentId: string,
    expectedRevision: number,
    references: AgentReferenceSet
  ) {
    return this.requireAgentRosterStore().updateAgent(agentId, expectedRevision, { references })
  }

  listRosterRuns(filter: ListRunsRequest) {
    return this.requireAgentRosterStore().listRuns(filter)
  }

  async moveRosterAgent(agentId: string, computerId: string) {
    const computers = await this.requireComputerRuntimeManager().list()
    if (!computers.some((computer) => computer.id === computerId)) {
      throw new Error(`Computer not found: ${computerId}`)
    }
    return this.requireAgentRosterStore().moveAgent(agentId, computerId)
  }

  runRosterAgent(request: RunAgentRequest) {
    if (!this.agentExecutionService) {
      throw new Error('Agent execution is unavailable')
    }
    return this.agentExecutionService.run(request)
  }

  getRunSourceControlStatus(runId: string) {
    return this.requireComputerRunSourceControl().status(runId)
  }

  getRunSourceControlDiff(request: AgentSourceControlDiffRequest) {
    return this.requireComputerRunSourceControl().diff(request)
  }

  getRunSourceControlReview(request: AgentSourceControlReviewRequest) {
    return this.requireComputerRunSourceControl().review(request)
  }

  getRunSourceControlReviewDiff(request: AgentSourceControlReviewDiffRequest) {
    return this.requireComputerRunSourceControl().reviewDiff(request)
  }

  listRuntimeComputers() {
    return this.requireComputerRuntimeManager().list()
  }

  createRuntimeComputer(spec: ComputerCreateSpec) {
    return this.requireComputerRuntimeManager().create(spec)
  }

  startRuntimeComputer(id: string) {
    return this.requireComputerRuntimeManager().start(id)
  }

  stopRuntimeComputer(id: string) {
    return this.requireComputerRuntimeManager().stop(id)
  }

  removeRuntimeComputer(id: string) {
    return this.requireComputerRuntimeManager().remove(id)
  }

  getComputerConfiguration(id: string) {
    return this.requireComputerRuntimeManager().getConfiguration(id)
  }

  planComputerConfiguration(
    id: string,
    expectedRevision: string,
    expectedDesiredState: ComputerDesiredState,
    configuration: ComputerConfigurationInput
  ) {
    return this.requireComputerRuntimeManager().planConfiguration(
      id,
      expectedRevision,
      expectedDesiredState,
      configuration
    )
  }

  replaceComputerConfiguration(
    id: string,
    expectedRevision: string,
    expectedDesiredState: ComputerDesiredState,
    configuration: ComputerConfigurationInput
  ) {
    return this.requireComputerRuntimeManager().replaceConfiguration(
      id,
      expectedRevision,
      expectedDesiredState,
      configuration
    )
  }

  getComputerGitIdentity(id: string) {
    return this.requireComputerGitIdentity().get(id)
  }

  setComputerGitIdentity(id: string, name: string, email: string) {
    return this.requireComputerGitIdentity().set(id, { name, email })
  }

  private requireComputerGitIdentity(): ComputerGitIdentityService {
    if (!this.computerGitIdentity) {
      throw new Error('Computer Git identity is unavailable')
    }
    return this.computerGitIdentity
  }

  private requireComputerRunSourceControl(): ComputerRunSourceControlService {
    if (!this.computerRunSourceControl) {
      throw new Error('Computer Run source control is unavailable')
    }
    return this.computerRunSourceControl
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
