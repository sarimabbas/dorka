import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type {
  CreateLocalDorkaProfileResult,
  DorkaProfileAuthStatus,
  DorkaProfileListResult,
  TransferDorkaProfileProjectResult
} from '../../../../shared/dorka-profiles'

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

const listState: DorkaProfileListResult = {
  activeProfileId: 'local-default',
  multiProfileUi: false,
  profiles: [
    {
      id: 'local-default',
      name: 'Personal',
      avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
      kind: 'local',
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1
    }
  ]
}

const createdState: CreateLocalDorkaProfileResult = {
  activeProfileId: 'local-default',
  profiles: [
    ...listState.profiles,
    {
      id: 'local-work',
      name: 'Work',
      avatar: { kind: 'initials', initials: 'W', color: 'neutral' },
      kind: 'local',
      createdAt: 2,
      updatedAt: 2,
      lastOpenedAt: 2
    }
  ],
  profile: {
    id: 'local-work',
    name: 'Work',
    avatar: { kind: 'initials', initials: 'W', color: 'neutral' },
    kind: 'local',
    createdAt: 2,
    updatedAt: 2,
    lastOpenedAt: 2
  }
}

const localAuthStatus: DorkaProfileAuthStatus = {
  activeProfileId: 'local-default',
  configured: false,
  state: 'unconfigured',
  persistence: 'none'
}

const connectedAuthStatus: DorkaProfileAuthStatus = {
  activeProfileId: 'local-default',
  configured: true,
  state: 'connected',
  persistence: 'encrypted',
  cloud: {
    cloudProfileId: 'cloud-profile-1',
    userId: 'user-1',
    email: 'nina@example.com',
    linkedAt: 3
  },
  capabilities: {
    flags: { share: true },
    refreshedAt: 4
  }
}

const dorkaProfilesApi = {
  list: vi.fn(),
  authStatus: vi.fn(),
  createLocal: vi.fn(),
  createCloudLinked: vi.fn(),
  connectCurrent: vi.fn(),
  refreshAuth: vi.fn(),
  signOutCurrent: vi.fn(),
  selectOrg: vi.fn(),
  switchProfile: vi.fn(),
  transferProject: vi.fn()
}

describe('dorka profile slice', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    toastErrorMock.mockReset()
    dorkaProfilesApi.authStatus.mockResolvedValue(localAuthStatus)
    vi.stubGlobal('window', {
      api: {
        dorkaProfiles: dorkaProfilesApi
      }
    })
  })

  it('fetches profiles into store state', async () => {
    dorkaProfilesApi.list.mockResolvedValue(listState)
    const store = createTestStore()

    await store.getState().fetchDorkaProfiles()

    expect(store.getState().activeDorkaProfileId).toBe('local-default')
    expect(store.getState().dorkaProfiles).toEqual(listState.profiles)
    expect(store.getState().dorkaProfileAuthStatus).toEqual(localAuthStatus)
    expect(store.getState().dorkaProfilesMultiProfileUi).toBe(false)
    expect(store.getState().dorkaProfilesLoading).toBe(false)
  })

  it('stores the multi-profile UI flag from the list result', async () => {
    dorkaProfilesApi.list.mockResolvedValue({ ...listState, multiProfileUi: true })
    const store = createTestStore()

    await store.getState().fetchDorkaProfiles()

    expect(store.getState().dorkaProfilesMultiProfileUi).toBe(true)
  })

  it('creates a local profile and returns the created summary', async () => {
    dorkaProfilesApi.createLocal.mockResolvedValue(createdState)
    const store = createTestStore()

    const profile = await store.getState().createLocalDorkaProfile('Work')

    expect(profile).toEqual(createdState.profile)
    expect(dorkaProfilesApi.createLocal).toHaveBeenCalledWith({ name: 'Work' })
    expect(store.getState().dorkaProfiles).toEqual(createdState.profiles)
  })

  it('fetches auth status independently', async () => {
    dorkaProfilesApi.authStatus.mockResolvedValue(connectedAuthStatus)
    const store = createTestStore()

    await expect(store.getState().fetchDorkaProfileAuthStatus()).resolves.toEqual(
      connectedAuthStatus
    )
    expect(store.getState().dorkaProfileAuthStatus).toEqual(connectedAuthStatus)
  })

  it('sets switching state while requesting a profile switch', async () => {
    dorkaProfilesApi.switchProfile.mockResolvedValue({ status: 'relaunching' })
    const store = createTestStore()
    store.setState({ activeDorkaProfileId: 'local-default' })

    const result = await store.getState().switchDorkaProfile('local-work')

    expect(result).toEqual({ status: 'relaunching' })
    expect(dorkaProfilesApi.switchProfile).toHaveBeenCalledWith({ profileId: 'local-work' })
    expect(store.getState().dorkaProfileSwitching).toBe(true)
  })

  it('releases switching state when main reports the profile is already active', async () => {
    // Why: a stale renderer activeDorkaProfileId must not lock the switcher
    // forever when no relaunch is actually coming.
    dorkaProfilesApi.switchProfile.mockResolvedValue({ status: 'already-active' })
    const store = createTestStore()
    store.setState({ activeDorkaProfileId: 'local-default' })

    const result = await store.getState().switchDorkaProfile('local-work')

    expect(result).toEqual({ status: 'already-active' })
    expect(store.getState().dorkaProfileSwitching).toBe(false)
  })

  it('does not call main when switching to the active profile', async () => {
    const store = createTestStore()
    store.setState({ activeDorkaProfileId: 'local-default' })

    const result = await store.getState().switchDorkaProfile('local-default')

    expect(result).toEqual({ status: 'already-active' })
    expect(dorkaProfilesApi.switchProfile).not.toHaveBeenCalled()
  })

  it('transfers projects through the profile API', async () => {
    const transferResult: TransferDorkaProfileProjectResult = {
      status: 'transferred',
      mode: 'copy',
      sourceProfileId: 'local-default',
      targetProfileId: 'local-work',
      sourceRepoId: 'repo-1',
      targetRepoId: 'repo-2',
      targetProjectId: 'repo:repo-2'
    }
    dorkaProfilesApi.transferProject.mockResolvedValue(transferResult)
    const store = createTestStore()

    const result = await store.getState().transferDorkaProfileProject({
      sourceProfileId: 'local-default',
      targetProfileId: 'local-work',
      repoId: 'repo-1',
      mode: 'copy'
    })

    expect(result).toEqual(transferResult)
    expect(dorkaProfilesApi.transferProject).toHaveBeenCalledWith({
      sourceProfileId: 'local-default',
      targetProfileId: 'local-work',
      repoId: 'repo-1',
      mode: 'copy'
    })
  })

  it('marks profile switching when a project transfer relaunches the app', async () => {
    const transferResult: TransferDorkaProfileProjectResult = {
      status: 'transferred',
      mode: 'move',
      sourceProfileId: 'local-default',
      targetProfileId: 'local-work',
      sourceRepoId: 'repo-1',
      targetRepoId: 'repo-1',
      targetProjectId: 'repo:repo-1',
      willRelaunch: true
    }
    dorkaProfilesApi.transferProject.mockResolvedValue(transferResult)
    const store = createTestStore()

    await store.getState().transferDorkaProfileProject({
      sourceProfileId: 'local-default',
      targetProfileId: 'local-work',
      repoId: 'repo-1',
      mode: 'move'
    })

    expect(store.getState().dorkaProfileSwitching).toBe(true)
  })

  it('warns when a project already exists in the target profile', async () => {
    const transferResult: TransferDorkaProfileProjectResult = {
      status: 'duplicate-target',
      sourceProfileId: 'local-default',
      targetProfileId: 'local-work',
      sourceRepoId: 'repo-1',
      duplicateRepoId: 'repo-existing'
    }
    dorkaProfilesApi.transferProject.mockResolvedValue(transferResult)
    const store = createTestStore()

    await store.getState().transferDorkaProfileProject({
      sourceProfileId: 'local-default',
      targetProfileId: 'local-work',
      repoId: 'repo-1',
      mode: 'copy'
    })

    expect(toastErrorMock).toHaveBeenCalledWith('Project already exists in that profile')
    expect(store.getState().dorkaProfileSwitching).toBe(false)
  })
})
