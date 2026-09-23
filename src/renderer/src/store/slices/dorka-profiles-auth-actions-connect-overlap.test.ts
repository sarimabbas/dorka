import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ConnectCurrentDorkaProfileResult,
  DorkaProfileAuthStatus,
  DorkaProfileListState,
  SignOutCurrentDorkaProfileResult
} from '../../../../shared/dorka-profiles'
import { createTestStore } from './store-test-helpers'

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    info: vi.fn(),
    success: toastSuccessMock,
    warning: vi.fn()
  }
}))

const listState: DorkaProfileListState = {
  activeProfileId: 'local-default',
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

const connectedCloud = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  linkedAt: 3
}

const connectedAuthStatus: DorkaProfileAuthStatus = {
  activeProfileId: 'local-default',
  configured: true,
  state: 'connected',
  persistence: 'encrypted',
  cloud: connectedCloud,
  organizations: [{ orgId: 'org-1', name: 'Acme', role: 'Admin' }],
  capabilities: { flags: { share: true }, refreshedAt: 4 }
}

const dorkaProfilesApi = {
  connectCurrent: vi.fn(),
  signOutCurrent: vi.fn()
}

describe('dorka profile overlapping connect actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    vi.stubGlobal('window', {
      api: { dorkaProfiles: dorkaProfilesApi }
    })
  })

  it('keeps the later sign-in and one success toast when both waits complete', async () => {
    const laterCloud = { ...connectedCloud, userId: 'user-2', email: 'ada@example.com' }
    const laterAuthStatus: DorkaProfileAuthStatus = {
      ...connectedAuthStatus,
      cloud: laterCloud
    }
    const earlierConnected: ConnectCurrentDorkaProfileResult = {
      status: 'connected',
      auth: connectedAuthStatus,
      activeProfileId: 'local-default',
      profiles: [{ ...listState.profiles[0], kind: 'cloud-linked', cloud: connectedCloud }]
    }
    const laterConnected: ConnectCurrentDorkaProfileResult = {
      status: 'connected',
      auth: laterAuthStatus,
      activeProfileId: 'local-default',
      profiles: [{ ...listState.profiles[0], kind: 'cloud-linked', cloud: laterCloud }]
    }
    let finishFirst!: (value: ConnectCurrentDorkaProfileResult) => void
    dorkaProfilesApi.connectCurrent
      .mockReturnValueOnce(
        new Promise<ConnectCurrentDorkaProfileResult>((resolve) => {
          finishFirst = resolve
        })
      )
      .mockResolvedValueOnce(laterConnected)
    const store = createTestStore()

    const first = store.getState().connectCurrentDorkaProfile()
    const second = store.getState().connectCurrentDorkaProfile()
    await expect(second).resolves.toEqual(laterConnected)
    finishFirst(earlierConnected)
    await expect(first).resolves.toEqual(earlierConnected)
    expect(toastSuccessMock).toHaveBeenCalledOnce()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(store.getState().dorkaProfileAuthStatus).toEqual(laterAuthStatus)
    expect(store.getState().dorkaProfiles).toEqual(laterConnected.profiles)
  })

  it('ignores an in-flight later connect after sign-out', async () => {
    const signedOutAuth: DorkaProfileAuthStatus = {
      activeProfileId: 'local-default',
      configured: true,
      state: 'local',
      persistence: 'none'
    }
    const signedOut: SignOutCurrentDorkaProfileResult = {
      status: 'signed-out',
      auth: signedOutAuth,
      activeProfileId: 'local-default',
      profiles: listState.profiles
    }
    const earlierConnected: ConnectCurrentDorkaProfileResult = {
      status: 'connected',
      auth: connectedAuthStatus,
      activeProfileId: 'local-default',
      profiles: [{ ...listState.profiles[0], kind: 'cloud-linked', cloud: connectedCloud }]
    }
    const laterConnected: ConnectCurrentDorkaProfileResult = {
      status: 'connected',
      auth: {
        ...connectedAuthStatus,
        cloud: { ...connectedCloud, userId: 'user-2', email: 'ada@example.com' }
      },
      activeProfileId: 'local-default',
      profiles: [
        {
          ...listState.profiles[0],
          kind: 'cloud-linked',
          cloud: { ...connectedCloud, userId: 'user-2', email: 'ada@example.com' }
        }
      ]
    }
    let finishLater!: (value: ConnectCurrentDorkaProfileResult) => void
    dorkaProfilesApi.connectCurrent.mockResolvedValueOnce(earlierConnected).mockReturnValueOnce(
      new Promise<ConnectCurrentDorkaProfileResult>((resolve) => {
        finishLater = resolve
      })
    )
    dorkaProfilesApi.signOutCurrent.mockResolvedValue(signedOut)
    const store = createTestStore()

    const earlier = store.getState().connectCurrentDorkaProfile()
    const later = store.getState().connectCurrentDorkaProfile()
    await expect(earlier).resolves.toEqual(earlierConnected)
    await expect(store.getState().signOutCurrentDorkaProfile()).resolves.toEqual(signedOut)
    finishLater(laterConnected)
    await expect(later).resolves.toEqual(laterConnected)
    expect(store.getState().dorkaProfileAuthStatus).toEqual(signedOutAuth)
    expect(store.getState().dorkaProfiles).toEqual(listState.profiles)
  })

  it('does not toast signed out when sign-out returns an already-relinked session', async () => {
    const signedOut: SignOutCurrentDorkaProfileResult = {
      status: 'signed-out',
      auth: connectedAuthStatus,
      activeProfileId: 'local-default',
      profiles: [{ ...listState.profiles[0], kind: 'cloud-linked', cloud: connectedCloud }]
    }
    dorkaProfilesApi.signOutCurrent.mockResolvedValue(signedOut)
    const store = createTestStore()

    await expect(store.getState().signOutCurrentDorkaProfile()).resolves.toEqual(signedOut)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(store.getState().dorkaProfileAuthStatus).toEqual(connectedAuthStatus)
  })
})
