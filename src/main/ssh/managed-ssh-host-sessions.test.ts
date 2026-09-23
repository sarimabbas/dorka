import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SshConnectionState, SshTarget } from '../../shared/ssh-types'
import { Store } from '../persistence'

const mocks = vi.hoisted(() => {
  let provider: object | undefined
  let connectError: Error | null = null
  let registerProviderOnEstablish = true
  let callbacks: { onStateChange: (targetId: string, state: SshConnectionState) => void } | null =
    null
  const connect = vi.fn(async (target: SshTarget) => {
    if (connectError) {
      throw connectError
    }
    callbacks?.onStateChange(target.id, {
      targetId: target.id,
      status: 'connected',
      error: null,
      reconnectAttempt: 0
    })
    return { target }
  })
  const disconnect = vi.fn(async (_targetId: string) => undefined)
  const establish = vi.fn(async () => {
    if (registerProviderOnEstablish) {
      provider = {}
    }
  })
  const detachAndPersist = vi.fn(async () => undefined)
  const reconnect = vi.fn(async () => {
    provider = {}
  })
  const removeAllForwards = vi.fn(async (_targetId: string) => undefined)

  return {
    get provider() {
      return provider
    },
    set provider(value: object | undefined) {
      provider = value
    },
    get connectError() {
      return connectError
    },
    set connectError(value: Error | null) {
      connectError = value
    },
    get registerProviderOnEstablish() {
      return registerProviderOnEstablish
    },
    set registerProviderOnEstablish(value: boolean) {
      registerProviderOnEstablish = value
    },
    get callbacks() {
      return callbacks
    },
    set callbacks(value: typeof callbacks) {
      callbacks = value
    },
    connect,
    disconnect,
    establish,
    detachAndPersist,
    reconnect,
    removeAllForwards
  }
})

vi.mock('../ipc/pty/provider/registry', () => ({
  getSshPtyProvider: () => mocks.provider
}))

vi.mock('./ssh-connection-manager', () => ({
  SshConnectionManager: class {
    constructor(callbacks: {
      onStateChange: (targetId: string, state: SshConnectionState) => void
    }) {
      mocks.callbacks = callbacks
    }

    connect(target: SshTarget) {
      return mocks.connect(target)
    }

    disconnect(targetId: string) {
      return mocks.disconnect(targetId)
    }

    getConnection() {
      return { connected: true }
    }

    getState(targetId: string) {
      return mocks.provider
        ? { targetId, status: 'connected', error: null, reconnectAttempt: 0 }
        : null
    }
  }
}))

vi.mock('./ssh-port-forward', () => ({
  SshPortForwardManager: class {
    removeAllForwards(targetId: string) {
      return mocks.removeAllForwards(targetId)
    }
  }
}))

vi.mock('./ssh-relay-session', () => ({
  SshRelaySession: class {
    private state = 'idle'

    setOnRelayLost() {}

    async establish() {
      await mocks.establish()
      this.state = 'ready'
    }

    async reconnect() {
      this.state = 'reconnecting'
      await mocks.reconnect()
      this.state = 'ready'
    }

    detachAndPersist() {
      return mocks.detachAndPersist()
    }

    getState() {
      return this.state
    }
  }
}))

import { ManagedSshHostSessions } from './managed-ssh-host-sessions'

const target: SshTarget = {
  id: 'runtime-ssh-computer-computer-1',
  label: 'computer-1',
  owner: { type: 'on-demand-runtime', runtimeId: 'computer:computer-1' },
  source: 'manual',
  host: 'dorka-computer-1',
  port: 2222,
  username: 'ubuntu',
  identityFile: '/server/private/computer-1/id_ed25519',
  identitiesOnly: true,
  relayGracePeriodSeconds: 0
}

describe('ManagedSshHostSessions', () => {
  beforeEach(() => {
    mocks.provider = undefined
    mocks.connectError = null
    mocks.registerProviderOnEstablish = true
    mocks.connect.mockClear()
    mocks.disconnect.mockClear()
    mocks.establish.mockClear()
    mocks.detachAndPersist.mockClear()
    mocks.reconnect.mockClear()
    mocks.removeAllForwards.mockClear()
  })

  it('reuses one incumbent SSH relay connection and returns only after its PTY provider exists', async () => {
    const sessions = new ManagedSshHostSessions({ store: new Store() })

    await Promise.all([sessions.connect(target), sessions.connect(target)])

    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.establish).toHaveBeenCalledTimes(1)
    expect(mocks.provider).toBeDefined()
  })

  it('waits for PTY registration even after relay establishment returns', async () => {
    const sessions = new ManagedSshHostSessions({ store: new Store() })
    mocks.registerProviderOnEstablish = false
    let connected = false

    const connecting = sessions.connect(target).then(() => {
      connected = true
    })
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(connected).toBe(false)

    mocks.provider = {}
    await connecting
    expect(connected).toBe(true)
  })

  it('disconnects every managed session during host shutdown', async () => {
    const sessions = new ManagedSshHostSessions({ store: new Store() })
    const other = { ...target, id: 'runtime-ssh-computer-computer-2' }
    await sessions.connect(target)
    await sessions.connect(other)

    await sessions.disconnectAll()

    expect(mocks.disconnect).toHaveBeenCalledWith(target.id)
    expect(mocks.disconnect).toHaveBeenCalledWith(other.id)
    expect(mocks.detachAndPersist).toHaveBeenCalledTimes(2)
  })

  it('rejects client-owned targets before opening a transport', () => {
    const sessions = new ManagedSshHostSessions({ store: new Store() })

    expect(() => sessions.connect({ ...target, id: 'ssh-user-target', owner: undefined })).toThrow(
      'runtime-owned target'
    )

    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it('redacts the server-private identity path from connection errors', async () => {
    const sessions = new ManagedSshHostSessions({ store: new Store() })
    const identityFile = '/server/private/computer-1/id_ed25519'
    mocks.connectError = new Error(`Could not read ${identityFile}`)

    const error = await sessions.connect(target).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('Could not read [redacted-private-key-path]')
    expect(String(error)).not.toContain(identityFile)
  })
})
