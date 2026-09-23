import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getRemoteHostPlatform } from '../main/ssh/ssh-remote-platform'
import { parseUnameToRelayPlatform, RELAY_REMOTE_DIR } from '../main/ssh/relay-protocol'
import { DEFAULT_AI_VAULT_SEARCH_SETTINGS } from '../shared/ai-vault-search-settings'
import { LOCAL_EXECUTION_HOST_ID } from '../shared/execution-host'
import { isComputerExecutionGeneration } from '../shared/computer-runtime'
import { installInProcessSessionSearchService } from '../main/ai-vault-search/session-search-in-process-service'
import type { RelayDispatcher } from './dispatcher'
import { RelayContext, expandTilde } from './context'
import { PtyHandler, type PtyDurableExitEvidence } from './pty-handler'
import { ManagedPtyExitJournal } from './managed-pty-exit-journal'
import { FsHandler } from './fs-handler'
import { GitHandler } from './git-handler'
import { GitResponseStreamRegistry } from './git-response-stream'
import { PreflightHandler } from './preflight-handler'
import { ExternalAutomationsHandler } from './external-automations-handler'
import { PortScanHandler } from './port-scan-handler'
import { AgentExecHandler } from './agent-exec-handler'
import { WorkspaceSessionHandler } from './workspace-session-handler'
import { AiVaultHandler } from './ai-vault-handler'
import { createRelayAiVaultService } from './ai-vault-service-factory'
import { registerRelayPluginHostCallHandlers } from './plugin-host-call-handler'
import { SshPtyConsumerSessionAdapter } from './ssh-pty-consumer-session-adapter'
import { RelayPtySourcePublication } from './relay-pty-source-publication'
import { SkillInstallHandler } from './skill-install-handler'
import { relayLogLine } from './relay-diagnostic-log'
import { remoteCliRequestTimeoutMs } from './remote-cli-timeout'

const COMPUTER_EXECUTION_GENERATION_MARKER = 'execution-generation'
const MANAGED_PTY_EXIT_JOURNAL_ROOT = join('managed-pty-exits', 'v1')

export function composeManagedPtyExitEvidence(
  homeDirectory: string,
  platform: NodeJS.Platform = process.platform
): PtyDurableExitEvidence | null {
  if (platform !== 'linux') {
    return null
  }
  let computerExecutionGeneration: string
  try {
    const marker = readFileSync(
      join(homeDirectory, '.dorka', COMPUTER_EXECUTION_GENERATION_MARKER),
      'utf8'
    )
    const withoutNewline = marker.endsWith('\n') ? marker.slice(0, -1) : marker
    computerExecutionGeneration = withoutNewline.endsWith('\r')
      ? withoutNewline.slice(0, -1)
      : withoutNewline
  } catch {
    return null
  }
  if (!isComputerExecutionGeneration(computerExecutionGeneration)) {
    return null
  }
  try {
    return Object.freeze({
      journal: new ManagedPtyExitJournal(
        join(homeDirectory, '.dorka', MANAGED_PTY_EXIT_JOURNAL_ROOT)
      ),
      computerExecutionGeneration
    })
  } catch (error) {
    relayLogLine(
      `[relay] Managed PTY exit journal disabled: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

export class RelayRuntimeServices {
  readonly ptyHandler: PtyHandler
  readonly ptyConsumerSessionAdapter: SshPtyConsumerSessionAdapter
  readonly ptySourcePublication: RelayPtySourcePublication
  readonly fsHandler: FsHandler
  readonly gitHandler: GitHandler
  readonly skillInstallHandler: SkillInstallHandler
  private readonly aiVaultService: ReturnType<typeof createRelayAiVaultService> | null
  private readonly sessionSearch: { dispose(): void } | null
  private readonly registeredHandlers: readonly unknown[]

  constructor(
    readonly dispatcher: RelayDispatcher,
    graceTimeMs: number,
    launchVersion: string
  ) {
    const context = new RelayContext()
    this.registerSessionHandlers(context)
    const durableExitEvidence = composeManagedPtyExitEvidence(homedir())
    this.ptyHandler = new PtyHandler(dispatcher, graceTimeMs, undefined, durableExitEvidence)
    this.ptyConsumerSessionAdapter = new SshPtyConsumerSessionAdapter(
      dispatcher,
      launchVersion,
      (id, paused) => this.ptyHandler.setConsumerDeliveryPaused(id, paused),
      (id) => this.ptyHandler.handleSourceCreditAvailable(id)
    )
    // Why wired after construction: the handler is built first, but PTY ownership has to be
    // attested from the consumer grant the adapter holds.
    this.ptyHandler.setConsumerIdentityResolver((clientId) =>
      this.ptyConsumerSessionAdapter.clientInstanceIdFor(clientId)
    )
    this.ptySourcePublication = new RelayPtySourcePublication(
      dispatcher,
      this.ptyConsumerSessionAdapter,
      (id) => this.ptyHandler.handleSourcePublicationCapacity(id)
    )
    this.ptyHandler.setSourcePublication(this.ptySourcePublication)

    // Why one instance for both handlers: a client reassembles a streamed reply by `streamId` alone,
    // so two registries would hand out the same id, and only GitHandler routes the `git.responseAck`
    // credit every pump waits on. A second registry is not an option — see git-response-stream.ts.
    const responseStreams = new GitResponseStreamRegistry()
    this.fsHandler = new FsHandler(dispatcher, context, undefined, responseStreams)
    const watchRegistry = this.fsHandler.getWatchRegistry()
    this.ptyHandler.setWorktreeRemovalCoordinator(watchRegistry)
    watchRegistry.setWorktreePtyTeardown((rootPath) =>
      this.ptyHandler.shutdownForWorktreePath(rootPath)
    )
    this.gitHandler = new GitHandler(dispatcher, context, watchRegistry, responseStreams)
    const preflightHandler = new PreflightHandler(dispatcher)
    this.skillInstallHandler = new SkillInstallHandler(dispatcher)
    const externalAutomationsHandler = new ExternalAutomationsHandler(dispatcher)
    const portScanHandler = new PortScanHandler(dispatcher)
    const agentExecHandler = new AgentExecHandler(dispatcher)
    const workspaceSessionHandler = new WorkspaceSessionHandler(dispatcher)
    const relayPlatform = parseUnameToRelayPlatform(process.platform, process.arch)
    const hostPlatform = relayPlatform ? getRemoteHostPlatform(relayPlatform) : undefined
    this.aiVaultService = hostPlatform ? createRelayAiVaultService(homedir(), hostPlatform) : null
    // Why beside the AI Vault sidecar and not inside it: that sidecar runs the
    // remote scanner, which reads through a filesystem provider and publishes
    // nothing to the transcript channel the index consumes. This process is the
    // one that would drive the index's own reads, and the only writer on the file.
    // Off until something can carry consent to a remote host (see the PR body);
    // registering it anyway is what makes this host answer `disabled` and not
    // `no-service`, which is the difference between off and too old.
    this.sessionSearch = installInProcessSessionSearchService({
      dataRoot: join(homedir(), RELAY_REMOTE_DIR),
      roots: { executionHostId: LOCAL_EXECUTION_HOST_ID },
      settings: DEFAULT_AI_VAULT_SEARCH_SETTINGS,
      onError: (error) =>
        relayLogLine(
          `[relay] session search: ${error instanceof Error ? error.message : String(error)}`
        )
    })
    this.registeredHandlers = [
      preflightHandler,
      this.skillInstallHandler,
      externalAutomationsHandler,
      portScanHandler,
      agentExecHandler,
      workspaceSessionHandler,
      new AiVaultHandler(dispatcher, {
        hostPlatform,
        service: this.aiVaultService ?? undefined
      })
    ]

    registerRelayPluginHostCallHandlers(
      dispatcher,
      () => null,
      () => ({ grantedCapabilities: null, services: null })
    )
    this.registerRemoteCliRoutes()
  }

  async disposeOwnedProcesses(): Promise<void> {
    await this.skillInstallHandler.dispose().catch((error) => {
      relayLogLine(
        `[relay] Skill upload cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      )
    })
    await this.aiVaultService?.dispose().catch((error) => {
      relayLogLine(
        `[relay] AI Vault sidecar shutdown failed: ${error instanceof Error ? error.message : String(error)}`
      )
    })
  }

  disposeHandlers(): void {
    this.sessionSearch?.dispose()
    this.fsHandler.dispose()
    this.gitHandler.dispose()
    void this.registeredHandlers
  }

  private registerSessionHandlers(context: RelayContext): void {
    this.dispatcher.onNotification('session.registerRoot', (params) => {
      const rootPath = params.rootPath as string
      if (rootPath) {
        context.registerRoot(rootPath)
      }
    })
    this.dispatcher.onRequest('session.registerRoot', async (params) => {
      const rootPath = params.rootPath as string
      if (rootPath) {
        context.registerRoot(rootPath)
      }
      return { ok: true }
    })
    this.dispatcher.onRequest('session.resolveHome', async (params) => ({
      resolvedPath: expandTilde(params.path as string)
    }))
  }

  private registerRemoteCliRoutes(): void {
    this.dispatcher.onRequest('dorka.cli', async (params, context) =>
      this.dispatcher.requestAnyClient('dorka.cli', params, {
        excludeClientId: context.clientId,
        timeoutMs: remoteCliRequestTimeoutMs(params)
      })
    )
    this.dispatcher.onRequest('dorka.cli.postOutput', async (params, context) =>
      this.dispatcher.requestAnyClient('dorka.cli.postOutput', params, {
        excludeClientId: context.clientId,
        timeoutMs: remoteCliRequestTimeoutMs(params)
      })
    )
  }
}
