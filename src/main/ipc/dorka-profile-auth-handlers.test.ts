import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  createCloudLinkedDorkaProfileMock,
  connectCurrentDorkaProfileMock,
  getCurrentDorkaProfileAuthStatusMock,
  refreshCurrentDorkaProfileAuthMock,
  selectCurrentDorkaProfileOrgMock,
  signOutCurrentDorkaProfileMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>(),
  createCloudLinkedDorkaProfileMock: vi.fn(),
  connectCurrentDorkaProfileMock: vi.fn(),
  getCurrentDorkaProfileAuthStatusMock: vi.fn(),
  refreshCurrentDorkaProfileAuthMock: vi.fn(),
  selectCurrentDorkaProfileOrgMock: vi.fn(),
  signOutCurrentDorkaProfileMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    exit: vi.fn(),
    relaunch: vi.fn()
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../tray/system-tray', () => ({
  destroySystemTray: vi.fn()
}))

vi.mock('../dorka-profiles/profile-index-store', () => ({
  createLocalDorkaProfile: vi.fn(),
  getDorkaProfileListState: vi.fn(),
  seedNewDorkaProfileTelemetryConsent: vi.fn(),
  setActiveDorkaProfile: vi.fn()
}))

vi.mock('../dorka-profiles/profile-project-transfer', () => ({
  transferDorkaProfileProject: vi.fn()
}))

vi.mock('../dorka-profiles/profile-cloud-service', () => ({
  createCloudLinkedDorkaProfile: createCloudLinkedDorkaProfileMock,
  connectCurrentDorkaProfile: connectCurrentDorkaProfileMock,
  getCurrentDorkaProfileAuthStatus: getCurrentDorkaProfileAuthStatusMock,
  refreshCurrentDorkaProfileAuth: refreshCurrentDorkaProfileAuthMock,
  selectCurrentDorkaProfileOrg: selectCurrentDorkaProfileOrgMock,
  signOutCurrentDorkaProfile: signOutCurrentDorkaProfileMock
}))

import { registerDorkaProfileHandlers } from './dorka-profiles'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'

describe('registerDorkaProfileHandlers auth channels', () => {
  beforeEach(() => {
    // Why the port and per-test: userData resolves through AppEnvironment now, and
    // the global setup's beforeEach reinstates its own fake before this runs.
    installFakeAppEnvironment({ getPath: () => '/tmp/dorka-user-data' })
    handlers.clear()
    createCloudLinkedDorkaProfileMock.mockReset()
    connectCurrentDorkaProfileMock.mockReset()
    getCurrentDorkaProfileAuthStatusMock.mockReset()
    refreshCurrentDorkaProfileAuthMock.mockReset()
    selectCurrentDorkaProfileOrgMock.mockReset()
    signOutCurrentDorkaProfileMock.mockReset()
  })

  it('returns auth status for the current profile', async () => {
    const status = {
      activeProfileId: 'local-default',
      configured: false,
      state: 'unconfigured',
      persistence: 'none'
    }
    getCurrentDorkaProfileAuthStatusMock.mockReturnValue(status)
    registerDorkaProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(Promise.resolve(handlers.get('dorkaProfiles:authStatus')?.(null))).resolves.toBe(
      status
    )
    expect(getCurrentDorkaProfileAuthStatusMock).toHaveBeenCalledWith('/tmp/dorka-user-data')
  })

  it('connects and signs out the current profile through the cloud service', async () => {
    const connectResult = { status: 'unconfigured', auth: { activeProfileId: 'local-default' } }
    const signOutResult = { status: 'signed-out', auth: { activeProfileId: 'local-default' } }
    connectCurrentDorkaProfileMock.mockResolvedValue(connectResult)
    signOutCurrentDorkaProfileMock.mockResolvedValue(signOutResult)
    registerDorkaProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:connectCurrent')?.(null))
    ).resolves.toBe(connectResult)
    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:signOutCurrent')?.(null))
    ).resolves.toBe(signOutResult)
    expect(connectCurrentDorkaProfileMock).toHaveBeenCalledWith('/tmp/dorka-user-data')
    expect(signOutCurrentDorkaProfileMock).toHaveBeenCalledWith('/tmp/dorka-user-data')
  })

  it('refreshes profile auth through the cloud service', async () => {
    const refreshResult = { status: 'refreshed', auth: { activeProfileId: 'local-default' } }
    refreshCurrentDorkaProfileAuthMock.mockResolvedValue(refreshResult)
    registerDorkaProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(Promise.resolve(handlers.get('dorkaProfiles:refreshAuth')?.(null))).resolves.toBe(
      refreshResult
    )
    expect(refreshCurrentDorkaProfileAuthMock).toHaveBeenCalledWith('/tmp/dorka-user-data')
  })

  it('validates organization selection before calling the cloud service', async () => {
    const selectResult = { status: 'selected', auth: { activeProfileId: 'local-default' } }
    selectCurrentDorkaProfileOrgMock.mockResolvedValue(selectResult)
    registerDorkaProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:selectOrg')?.(null, { orgId: ' org-1 ' }))
    ).resolves.toBe(selectResult)
    expect(selectCurrentDorkaProfileOrgMock).toHaveBeenCalledWith('/tmp/dorka-user-data', 'org-1')

    await expect(
      Promise.resolve(handlers.get('dorkaProfiles:selectOrg')?.(null, { orgId: ' ' }))
    ).rejects.toThrow('invalid_dorka_profile_org_selection')
  })

  it('creates cloud-linked profiles with trimmed optional args', async () => {
    const createResult = {
      status: 'created',
      auth: { activeProfileId: 'local-default' },
      activeProfileId: 'local-default',
      profiles: [],
      profile: { id: 'cloud-1' }
    }
    createCloudLinkedDorkaProfileMock.mockResolvedValue(createResult)
    registerDorkaProfileHandlers({
      flush: vi.fn(),
      freezeWrites: vi.fn(),
      getSettings: () => ({})
    } as never)

    await expect(
      Promise.resolve(
        handlers.get('dorkaProfiles:createCloudLinked')?.(null, { orgId: ' org-1 ', name: ' Acme ' })
      )
    ).resolves.toBe(createResult)
    expect(createCloudLinkedDorkaProfileMock).toHaveBeenCalledWith('/tmp/dorka-user-data', {
      orgId: 'org-1',
      name: 'Acme'
    })
  })
})
