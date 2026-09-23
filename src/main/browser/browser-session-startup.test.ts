import { beforeEach, describe, expect, it, vi } from 'vitest'

function installRegistryMock(): {
  configureForDorkaProfileMock: ReturnType<typeof vi.fn>
  configureRouteSessionsForDorkaProfileMock: ReturnType<typeof vi.fn>
  configurePairedRuntimeBrowserClientHostsForDorkaProfileMock: ReturnType<typeof vi.fn>
  collectOrphanedBrowserRoutePartitionStorageMock: ReturnType<typeof vi.fn>
  applyPendingCookieImportMock: ReturnType<typeof vi.fn>
  initializeBrowserSessionsFromPersistedStateMock: ReturnType<typeof vi.fn>
} {
  const configureForDorkaProfileMock = vi.fn()
  const configureRouteSessionsForDorkaProfileMock = vi.fn()
  const configurePairedRuntimeBrowserClientHostsForDorkaProfileMock = vi.fn()
  const collectOrphanedBrowserRoutePartitionStorageMock = vi.fn(async () => [])
  const applyPendingCookieImportMock = vi.fn()
  const initializeBrowserSessionsFromPersistedStateMock = vi.fn()

  vi.doMock('./browser-session-registry', () => ({
    browserSessionRegistry: {
      configureForDorkaProfile: configureForDorkaProfileMock,
      applyPendingCookieImport: applyPendingCookieImportMock,
      initializeBrowserSessionsFromPersistedState: initializeBrowserSessionsFromPersistedStateMock
    }
  }))
  vi.doMock('./browser-route-session-runtime', () => ({
    configureRouteSessionsForDorkaProfile: configureRouteSessionsForDorkaProfileMock
  }))
  vi.doMock('./browser-route-partition-storage-runtime', () => ({
    collectOrphanedBrowserRoutePartitionStorage: collectOrphanedBrowserRoutePartitionStorageMock
  }))
  vi.doMock('./paired-runtime-browser-client-host-runtime', () => ({
    configurePairedRuntimeBrowserClientHostsForDorkaProfile:
      configurePairedRuntimeBrowserClientHostsForDorkaProfileMock
  }))

  return {
    configureForDorkaProfileMock,
    configureRouteSessionsForDorkaProfileMock,
    configurePairedRuntimeBrowserClientHostsForDorkaProfileMock,
    collectOrphanedBrowserRoutePartitionStorageMock,
    applyPendingCookieImportMock,
    initializeBrowserSessionsFromPersistedStateMock
  }
}

describe('initializeBrowserSessionsForApp', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('replays pending cookie imports before initializing browser sessions', async () => {
    const { applyPendingCookieImportMock, initializeBrowserSessionsFromPersistedStateMock } =
      installRegistryMock()
    const { initializeBrowserSessionsForApp } = await import('./browser-session-startup')

    initializeBrowserSessionsForApp()

    expect(applyPendingCookieImportMock).toHaveBeenCalledOnce()
    expect(initializeBrowserSessionsFromPersistedStateMock).toHaveBeenCalledOnce()
    expect(applyPendingCookieImportMock.mock.invocationCallOrder[0]).toBeLessThan(
      initializeBrowserSessionsFromPersistedStateMock.mock.invocationCallOrder[0]
    )
  })

  it('configures the active Dorka profile before replaying browser sessions', async () => {
    const {
      configureForDorkaProfileMock,
      configureRouteSessionsForDorkaProfileMock,
      configurePairedRuntimeBrowserClientHostsForDorkaProfileMock,
      applyPendingCookieImportMock,
      initializeBrowserSessionsFromPersistedStateMock
    } = installRegistryMock()
    const { initializeBrowserSessionsForApp } = await import('./browser-session-startup')

    initializeBrowserSessionsForApp({
      dorkaProfileId: 'local-work',
      profileDirectory: '/profiles/local-work'
    })

    expect(configureForDorkaProfileMock).toHaveBeenCalledWith({
      dorkaProfileId: 'local-work',
      profileDirectory: '/profiles/local-work'
    })
    expect(configureRouteSessionsForDorkaProfileMock).toHaveBeenCalledWith({
      dorkaProfileId: 'local-work',
      profileDirectory: '/profiles/local-work'
    })
    expect(configurePairedRuntimeBrowserClientHostsForDorkaProfileMock).toHaveBeenCalledWith({
      dorkaProfileId: 'local-work'
    })
    expect(configureForDorkaProfileMock.mock.invocationCallOrder[0]).toBeLessThan(
      applyPendingCookieImportMock.mock.invocationCallOrder[0]
    )
    expect(configureRouteSessionsForDorkaProfileMock.mock.invocationCallOrder[0]).toBeLessThan(
      applyPendingCookieImportMock.mock.invocationCallOrder[0]
    )
    expect(
      configurePairedRuntimeBrowserClientHostsForDorkaProfileMock.mock.invocationCallOrder[0]
    ).toBeLessThan(applyPendingCookieImportMock.mock.invocationCallOrder[0])
    expect(applyPendingCookieImportMock.mock.invocationCallOrder[0]).toBeLessThan(
      initializeBrowserSessionsFromPersistedStateMock.mock.invocationCallOrder[0]
    )
  })

  it('sweeps orphaned route partitions once the profile binding runtime is configured', async () => {
    const {
      configureRouteSessionsForDorkaProfileMock,
      collectOrphanedBrowserRoutePartitionStorageMock
    } = installRegistryMock()
    const { initializeBrowserSessionsForApp } = await import('./browser-session-startup')

    initializeBrowserSessionsForApp({
      dorkaProfileId: 'local-work',
      profileDirectory: '/profiles/local-work'
    })

    expect(collectOrphanedBrowserRoutePartitionStorageMock).toHaveBeenCalledOnce()
    // Hoisting the sweep above the binding runtime leaves it with no active profile and it collects nothing.
    expect(configureRouteSessionsForDorkaProfileMock.mock.invocationCallOrder[0]).toBeLessThan(
      collectOrphanedBrowserRoutePartitionStorageMock.mock.invocationCallOrder[0]
    )
  })

  it('does not sweep route partitions when no profile is active', async () => {
    const { collectOrphanedBrowserRoutePartitionStorageMock } = installRegistryMock()
    const { initializeBrowserSessionsForApp } = await import('./browser-session-startup')

    initializeBrowserSessionsForApp()

    expect(collectOrphanedBrowserRoutePartitionStorageMock).not.toHaveBeenCalled()
  })

  it('initializes browser sessions once per app process', async () => {
    const { applyPendingCookieImportMock, initializeBrowserSessionsFromPersistedStateMock } =
      installRegistryMock()
    const { initializeBrowserSessionsForApp } = await import('./browser-session-startup')

    initializeBrowserSessionsForApp()
    initializeBrowserSessionsForApp()

    expect(applyPendingCookieImportMock).toHaveBeenCalledOnce()
    expect(initializeBrowserSessionsFromPersistedStateMock).toHaveBeenCalledOnce()
  })

  it('retries if initialization fails before completion', async () => {
    const { applyPendingCookieImportMock, initializeBrowserSessionsFromPersistedStateMock } =
      installRegistryMock()
    initializeBrowserSessionsFromPersistedStateMock.mockImplementationOnce(() => {
      throw new Error('session init failed')
    })
    const { initializeBrowserSessionsForApp } = await import('./browser-session-startup')

    expect(() => initializeBrowserSessionsForApp()).toThrow('session init failed')
    initializeBrowserSessionsForApp()

    expect(applyPendingCookieImportMock).toHaveBeenCalledTimes(2)
    expect(initializeBrowserSessionsFromPersistedStateMock).toHaveBeenCalledTimes(2)
  })
})
