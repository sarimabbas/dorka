import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  appExitMock,
  appQuitMock,
  appRelaunchMock,
  relaunchAppMock,
  destroySystemTrayMock,
  createLocalDorkaProfileMock,
  getDorkaProfileListStateMock,
  seedNewDorkaProfileTelemetryConsentMock,
  setActiveDorkaProfileMock,
  transferDorkaProfileProjectMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>(),
  appExitMock: vi.fn(),
  appQuitMock: vi.fn(),
  appRelaunchMock: vi.fn(),
  relaunchAppMock: vi.fn(),
  destroySystemTrayMock: vi.fn(),
  createLocalDorkaProfileMock: vi.fn(),
  getDorkaProfileListStateMock: vi.fn(),
  seedNewDorkaProfileTelemetryConsentMock: vi.fn(),
  setActiveDorkaProfileMock: vi.fn(),
  transferDorkaProfileProjectMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    exit: appExitMock,
    quit: appQuitMock,
    relaunch: appRelaunchMock
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../tray/system-tray', () => ({
  destroySystemTray: destroySystemTrayMock
}))

vi.mock('../app-relaunch', () => ({
  relaunchApp: relaunchAppMock
}))

vi.mock('../dorka-profiles/profile-index-store', () => ({
  createLocalDorkaProfile: createLocalDorkaProfileMock,
  getDorkaProfileListState: getDorkaProfileListStateMock,
  seedNewDorkaProfileTelemetryConsent: seedNewDorkaProfileTelemetryConsentMock,
  setActiveDorkaProfile: setActiveDorkaProfileMock
}))

function makeStoreMock(flushPendingOrThrowAsync = vi.fn()): {
  flushPendingOrThrowAsync: typeof flushPendingOrThrowAsync
  freezeWrites: ReturnType<typeof vi.fn>
  getSettings: () => Record<string, never>
} {
  return { flushPendingOrThrowAsync, freezeWrites: vi.fn(), getSettings: () => ({}) }
}

vi.mock('../dorka-profiles/profile-project-transfer', () => ({
  transferDorkaProfileProject: transferDorkaProfileProjectMock
}))

import { registerDorkaProfileHandlers } from './dorka-profiles'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'

describe('registerDorkaProfileHandlers', () => {
  beforeEach(() => {
    // Why the port and per-test: userData resolves through AppEnvironment now, and
    // the global setup's beforeEach reinstates its own fake before this runs.
    installFakeAppEnvironment({ getPath: () => '/tmp/dorka-user-data' })
    vi.useFakeTimers()
    handlers.clear()
    appExitMock.mockReset()
    appQuitMock.mockReset()
    appRelaunchMock.mockReset()
    relaunchAppMock.mockReset()
    relaunchAppMock.mockImplementation(() => appRelaunchMock())
    destroySystemTrayMock.mockReset()
    createLocalDorkaProfileMock.mockReset()
    getDorkaProfileListStateMock.mockReset()
    seedNewDorkaProfileTelemetryConsentMock.mockReset()
    setActiveDorkaProfileMock.mockReset()
    transferDorkaProfileProjectMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers list and create handlers', async () => {
    const listState = {
      activeProfileId: 'local-default',
      profiles: [{ id: 'local-default', name: 'Personal' }]
    }
    const createState = {
      ...listState,
      profile: { id: 'local-work', name: 'Work' }
    }
    getDorkaProfileListStateMock.mockReturnValue(listState)
    createLocalDorkaProfileMock.mockReturnValue(createState)

    registerDorkaProfileHandlers(makeStoreMock() as never)

    await expect(Promise.resolve(handlers.get('dorkaProfiles:list')?.(null))).resolves.toEqual({
      ...listState,
      multiProfileUi: false
    })
    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:createLocal')?.(null, { name: 'Work' }))
    ).resolves.toBe(createState)
    expect(createLocalDorkaProfileMock).toHaveBeenCalledWith({ name: 'Work' })
  })

  it('reports multiProfileUi when the env flag is set', async () => {
    const previous = process.env.DORKA_MULTI_PROFILE_UI
    process.env.DORKA_MULTI_PROFILE_UI = '1'
    try {
      getDorkaProfileListStateMock.mockReturnValue({
        activeProfileId: 'local-default',
        profiles: []
      })
      registerDorkaProfileHandlers(makeStoreMock() as never)

      await expect(Promise.resolve(handlers.get('dorkaProfiles:list')?.(null))).resolves.toEqual({
        activeProfileId: 'local-default',
        profiles: [],
        multiProfileUi: true
      })
    } finally {
      if (previous === undefined) {
        delete process.env.DORKA_MULTI_PROFILE_UI
      } else {
        process.env.DORKA_MULTI_PROFILE_UI = previous
      }
    }
  })

  it('marks the target profile active, flushes, and relaunches', async () => {
    const flush = vi.fn()
    const onBeforeRelaunch = vi.fn()
    getDorkaProfileListStateMock.mockReturnValue({
      activeProfileId: 'local-default',
      profiles: []
    })
    setActiveDorkaProfileMock.mockReturnValue({
      activeProfileId: 'local-work',
      profiles: []
    })
    registerDorkaProfileHandlers(makeStoreMock(flush) as never, { onBeforeRelaunch })

    const resultPromise = Promise.resolve(
      handlers.get('dorkaProfiles:switch')?.(null, { profileId: 'local-work' })
    )

    await expect(resultPromise).resolves.toEqual({ status: 'relaunching' })
    expect(setActiveDorkaProfileMock).toHaveBeenCalledWith('local-work')
    expect(flush).toHaveBeenCalledOnce()
    expect(onBeforeRelaunch).toHaveBeenCalledOnce()
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
      setActiveDorkaProfileMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )
    expect(flush).toHaveBeenCalledBefore(onBeforeRelaunch)
    expect(appRelaunchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)

    expect(appRelaunchMock).toHaveBeenCalledOnce()
    expect(relaunchAppMock).toHaveBeenCalledWith('profile-switch')
    // Why quit, not exit: before-quit/will-quit teardown (scrollback capture,
    // PTY kill, daemon checkpoints) must run on a profile switch.
    expect(appQuitMock).toHaveBeenCalledOnce()
    expect(appExitMock).not.toHaveBeenCalled()
  })

  it('does not mark a profile active when current profile flush fails', async () => {
    const flush = vi.fn(() => {
      throw new Error('flush_failed')
    })
    getDorkaProfileListStateMock.mockReturnValue({
      activeProfileId: 'local-default',
      profiles: []
    })
    registerDorkaProfileHandlers(makeStoreMock(flush) as never)

    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:switch')?.(null, { profileId: 'local-work' }))
    ).rejects.toThrow('flush_failed')

    expect(setActiveDorkaProfileMock).not.toHaveBeenCalled()
    expect(appRelaunchMock).not.toHaveBeenCalled()
  })

  it('does not switch profiles when persistence cannot reach quiescence', async () => {
    const flush = vi.fn(() => new Promise<void>(() => {}))
    const onBeforeRelaunch = vi.fn()
    getDorkaProfileListStateMock.mockReturnValue({
      activeProfileId: 'local-default',
      profiles: []
    })
    registerDorkaProfileHandlers(makeStoreMock(flush) as never, { onBeforeRelaunch })

    const switchProfile = Promise.resolve(
      handlers.get('dorkaProfiles:switch')?.(null, { profileId: 'local-work' })
    )
    const rejection = expect(switchProfile).rejects.toThrow('dorka_profile_persistence_timeout')
    await vi.advanceTimersByTimeAsync(20_000)
    await rejection

    expect(setActiveDorkaProfileMock).not.toHaveBeenCalled()
    expect(appRelaunchMock).not.toHaveBeenCalled()
    expect(onBeforeRelaunch).not.toHaveBeenCalled()
  })

  it('does not relaunch when switching to the active profile', async () => {
    getDorkaProfileListStateMock.mockReturnValue({
      activeProfileId: 'local-default',
      profiles: []
    })
    registerDorkaProfileHandlers(makeStoreMock() as never)

    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:switch')?.(null, { profileId: 'local-default' }))
    ).resolves.toEqual({ status: 'already-active' })

    expect(setActiveDorkaProfileMock).not.toHaveBeenCalled()
    expect(appRelaunchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid profile ids', async () => {
    registerDorkaProfileHandlers(makeStoreMock() as never)

    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:switch')?.(null, { profileId: ' ' }))
    ).rejects.toThrow('invalid_dorka_profile_id')
  })

  it('transfers projects between inactive profiles after flushing active state', async () => {
    const flush = vi.fn()
    const result = {
      status: 'transferred',
      mode: 'copy',
      sourceProfileId: 'personal',
      targetProfileId: 'work',
      sourceRepoId: 'repo-1',
      targetRepoId: 'repo-2',
      targetProjectId: 'repo:repo-2'
    }
    getDorkaProfileListStateMock.mockReturnValue({
      activeProfileId: 'personal',
      profiles: []
    })
    transferDorkaProfileProjectMock.mockReturnValue(result)
    registerDorkaProfileHandlers(makeStoreMock(flush) as never)

    await expect(
      Promise.resolve(
        handlers.get('dorkaProfiles:transferProject')?.(null, {
          sourceProfileId: ' personal ',
          targetProfileId: ' work ',
          repoId: ' repo-1 ',
          mode: 'copy'
        })
      )
    ).resolves.toBe(result)

    expect(flush).toHaveBeenCalledOnce()
    expect(transferDorkaProfileProjectMock).toHaveBeenCalledWith(
      {
        sourceProfileId: 'personal',
        targetProfileId: 'work',
        repoId: 'repo-1',
        mode: 'copy'
      },
      '/tmp/dorka-user-data'
    )
  })

  it('moves a project out of the active profile and relaunches into the target profile', async () => {
    const flush = vi.fn()
    const onBeforeRelaunch = vi.fn()
    const result = {
      status: 'transferred',
      mode: 'move',
      sourceProfileId: 'personal',
      targetProfileId: 'work',
      sourceRepoId: 'repo-1',
      targetRepoId: 'repo-1',
      targetProjectId: 'repo:repo-1'
    }
    getDorkaProfileListStateMock.mockReturnValue({
      activeProfileId: 'personal',
      profiles: []
    })
    transferDorkaProfileProjectMock.mockReturnValue(result)
    registerDorkaProfileHandlers(makeStoreMock(flush) as never, { onBeforeRelaunch })

    await expect(
      Promise.resolve(
        handlers.get('dorkaProfiles:transferProject')?.(null, {
          sourceProfileId: 'personal',
          targetProfileId: 'work',
          repoId: 'repo-1',
          mode: 'move'
        })
      )
    ).resolves.toEqual({ ...result, willRelaunch: true })

    expect(onBeforeRelaunch).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledOnce()
    expect(transferDorkaProfileProjectMock).toHaveBeenCalledWith(
      {
        sourceProfileId: 'personal',
        targetProfileId: 'work',
        repoId: 'repo-1',
        mode: 'move'
      },
      '/tmp/dorka-user-data'
    )
    expect(setActiveDorkaProfileMock).toHaveBeenCalledWith('work')
    expect(appRelaunchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)

    expect(appRelaunchMock).toHaveBeenCalledOnce()
    expect(relaunchAppMock).toHaveBeenCalledWith('profile-transfer')
    expect(appQuitMock).toHaveBeenCalledOnce()
    expect(appExitMock).not.toHaveBeenCalled()
  })

  it('rejects transfers that would mutate the active target profile offline', async () => {
    getDorkaProfileListStateMock.mockReturnValue({
      activeProfileId: 'work',
      profiles: []
    })
    registerDorkaProfileHandlers(makeStoreMock() as never)

    await expect(
      Promise.resolve(
        handlers.get('dorkaProfiles:transferProject')?.(null, {
          sourceProfileId: 'personal',
          targetProfileId: 'work',
          repoId: 'repo-1',
          mode: 'copy'
        })
      )
    ).rejects.toThrow('active_target_dorka_profile_transfer_requires_relaunch')

    expect(transferDorkaProfileProjectMock).not.toHaveBeenCalled()
  })
})
