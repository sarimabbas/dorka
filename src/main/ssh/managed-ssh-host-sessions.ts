import type { Store } from '../persistence'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import { getSshPtyProvider } from '../ipc/pty/provider/registry'
import { isRuntimeOwnedSshTargetId } from '../../shared/execution-host'
import type { SshConnectionState, SshTarget } from '../../shared/ssh-types'
import { SshConnectionManager } from './ssh-connection-manager'
import { SshPortForwardManager } from './ssh-port-forward'
import { SshRelaySession } from './ssh-relay-session'
import type { ManagedDurableExitEvidence } from './managed-durable-exit-evidence'
import { execCommand } from './ssh-relay-exec-command'

const PROVIDER_READY_TIMEOUT_MS = 10_000
const PROVIDER_READY_INTERVAL_MS = 25

export type ManagedSshHostSessionsOptions = {
  store: Store
  runtime?: DorkaRuntimeService
  onReconnectReady?: (
    targetId: string,
    connection: ManagedSshHostConnection
  ) => void | Promise<void>
}

export type ManagedSshHostConnection = {
  durableExitEvidence?: ManagedDurableExitEvidence
}

export type ManagedComputerSshBridgeEvidence = {
  executionGeneration: string
  hostPublicKey: string
}

/** Owns runtime-created SSH transports and relay sessions without Electron IPC. */
export class ManagedSshHostSessions {
  private readonly connectionManager: SshConnectionManager
  private readonly portForwardManager = new SshPortForwardManager()
  private readonly sessions = new Map<string, SshRelaySession>()
  private readonly targets = new Map<string, SshTarget>()
  private readonly connecting = new Map<string, Promise<ManagedSshHostConnection>>()
  private readonly reconnecting = new Map<string, Promise<void>>()

  constructor(private readonly options: ManagedSshHostSessionsOptions) {
    this.connectionManager = new SshConnectionManager({
      onStateChange: (targetId, state) => this.handleConnectionState(targetId, state),
      // Managed targets must authenticate only with their server-owned identity file.
      onCredentialRequest: async () => null
    })
  }

  connect(target: SshTarget, signal?: AbortSignal): Promise<ManagedSshHostConnection> {
    this.assertManagedTarget(target)
    const existing = this.connecting.get(target.id)
    if (existing) {
      return existing
    }
    if (this.isReady(target.id)) {
      return this.projectConnection(target.id)
    }

    const promise = this.connectTarget(target, signal).finally(() => {
      if (this.connecting.get(target.id) === promise) {
        this.connecting.delete(target.id)
      }
    })
    this.connecting.set(target.id, promise)
    return promise
  }

  async readComputerSshBridgeEvidence(targetId: string): Promise<ManagedComputerSshBridgeEvidence> {
    const connection = this.connectionManager.getConnection(targetId)
    if (!connection || !this.isReady(targetId)) {
      throw new Error('Managed SSH connection is not ready.')
    }
    const output = await execCommand(
      connection,
      `set -eu; generation="$(cat /home/ubuntu/.dorka/execution-generation)"; printf 'generation=%s\\n' "$generation"; printf 'host-key='; cat /etc/ssh/ssh_host_ed25519_key.pub`
    )
    return parseComputerSshBridgeEvidence(output)
  }

  async disconnectAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.targets.keys()].map((id) => this.disconnect(id))
    )
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      throw failure.reason
    }
  }

  async disconnect(targetId: string): Promise<void> {
    const target = this.targets.get(targetId)
    const session = this.sessions.get(targetId)
    this.targets.delete(targetId)
    this.sessions.delete(targetId)
    this.connecting.delete(targetId)
    this.reconnecting.delete(targetId)

    const results = await Promise.allSettled([
      this.connectionManager.disconnect(targetId),
      this.portForwardManager.removeAllForwards(targetId),
      session?.detachAndPersist()
    ])
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      throw sanitizeManagedSshError(failure.reason, target?.identityFile)
    }
  }

  private async connectTarget(
    target: SshTarget,
    signal?: AbortSignal
  ): Promise<ManagedSshHostConnection> {
    if (signal?.aborted) {
      throw new Error('Managed SSH connection was aborted.')
    }
    this.targets.set(target.id, target)
    const session = this.createSession(target.id)
    this.sessions.set(target.id, session)

    try {
      const connection = await this.connectionManager.connect(target)
      if (signal?.aborted) {
        throw new Error('Managed SSH connection was aborted.')
      }
      await session.establish(connection, target.relayGracePeriodSeconds)
      await waitForSshPtyProvider(target.id, signal)
      return await this.projectConnection(target.id)
    } catch (error) {
      this.sessions.delete(target.id)
      this.targets.delete(target.id)
      await Promise.allSettled([
        session.detachAndPersist(),
        this.connectionManager.disconnect(target.id)
      ])
      throw sanitizeManagedSshError(error, target.identityFile)
    }
  }

  private async projectConnection(targetId: string): Promise<ManagedSshHostConnection> {
    const durableExitEvidence = await this.sessions.get(targetId)?.getManagedDurableExitEvidence()
    return durableExitEvidence ? { durableExitEvidence } : {}
  }

  private createSession(targetId: string): SshRelaySession {
    const session = new SshRelaySession(
      targetId,
      () => null,
      this.options.store,
      this.portForwardManager,
      this.options.runtime
    )
    session.setOnRelayLost(() => this.reconnect(targetId))
    return session
  }

  private handleConnectionState(targetId: string, state: SshConnectionState): void {
    const sessionState = this.sessions.get(targetId)?.getState()
    if (
      state.status === 'connected' &&
      (sessionState === 'ready' || sessionState === 'reconnecting')
    ) {
      this.reconnect(targetId)
    }
  }

  private reconnect(targetId: string): void {
    if (this.reconnecting.has(targetId)) {
      return
    }
    const session = this.sessions.get(targetId)
    const connection = this.connectionManager.getConnection(targetId)
    const target = this.targets.get(targetId)
    if (!session || !connection || !target) {
      return
    }
    const promise = session
      .reconnect(connection, target.relayGracePeriodSeconds)
      .then(async () => {
        await waitForSshPtyProvider(targetId)
        const projected = await this.projectConnection(targetId)
        await this.options.onReconnectReady?.(targetId, projected)
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.reconnecting.get(targetId) === promise) {
          this.reconnecting.delete(targetId)
        }
      })
    this.reconnecting.set(targetId, promise)
  }

  private isReady(targetId: string): boolean {
    return (
      this.connectionManager.getState(targetId)?.status === 'connected' &&
      this.sessions.get(targetId)?.getState() === 'ready' &&
      getSshPtyProvider(targetId) !== undefined
    )
  }

  private assertManagedTarget(target: SshTarget): void {
    if (!isRuntimeOwnedSshTargetId(target.id) || target.owner?.type !== 'on-demand-runtime') {
      throw new Error('Managed SSH sessions require a runtime-owned target.')
    }
  }
}

function parseComputerSshBridgeEvidence(output: string): ManagedComputerSshBridgeEvidence {
  const match = /^generation=([^\r\n]+)\r?\nhost-key=([^\r\n]+)\r?\n?$/.exec(output)
  if (!match?.[1] || !match[2]) {
    throw new Error('Managed Computer SSH bridge evidence is invalid.')
  }
  return { executionGeneration: match[1], hostPublicKey: match[2] }
}

async function waitForSshPtyProvider(targetId: string, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + PROVIDER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('Managed SSH connection was aborted.')
    }
    if (getSshPtyProvider(targetId)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, PROVIDER_READY_INTERVAL_MS))
  }
  throw new Error('Managed SSH terminal provider was not ready.')
}

export function sanitizeManagedSshError(error: unknown, identityFile?: string): Error {
  let message = error instanceof Error ? error.message : String(error)
  if (identityFile) {
    message = message.replaceAll(identityFile, '[redacted-private-key-path]')
  }
  return new Error(message)
}
