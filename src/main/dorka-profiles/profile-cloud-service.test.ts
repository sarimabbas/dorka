import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  DorkaCloudCapabilities,
  DorkaCloudOrgSummary,
  DorkaProfileCloudSummary
} from '../../shared/dorka-profiles'
import type { DorkaCloudSessionExchangeResponse } from './profile-cloud-session-exchange'

const {
  beginDorkaCloudPkceFlowMock,
  createDorkaCloudProfileMock,
  exchangeDorkaCloudAuthCodeMock,
  revokeDorkaCloudSessionMock,
  selectDorkaCloudOrgMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginDorkaCloudPkceFlowMock: vi.fn(),
  createDorkaCloudProfileMock: vi.fn(),
  exchangeDorkaCloudAuthCodeMock: vi.fn(),
  revokeDorkaCloudSessionMock: vi.fn(),
  selectDorkaCloudOrgMock: vi.fn(),
  safeStorageMock: {
    decryptString: vi.fn((value: Buffer) => value.toString('utf-8')),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf-8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}))

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataPath
  },
  safeStorage: safeStorageMock
}))

vi.mock('./profile-cloud-pkce', () => ({
  beginDorkaCloudPkceFlow: beginDorkaCloudPkceFlowMock
}))

vi.mock('./profile-cloud-client', () => ({
  createDorkaCloudProfile: createDorkaCloudProfileMock,
  exchangeDorkaCloudAuthCode: exchangeDorkaCloudAuthCodeMock,
  revokeDorkaCloudSession: revokeDorkaCloudSessionMock,
  selectDorkaCloudOrg: selectDorkaCloudOrgMock
}))

import {
  connectCurrentDorkaProfile,
  createCloudLinkedDorkaProfile,
  getCurrentDorkaProfileAuthStatus,
  selectCurrentDorkaProfileOrg,
  signOutCurrentDorkaProfile
} from './profile-cloud-service'

const cloudSummary: DorkaProfileCloudSummary = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  displayName: 'Nina',
  linkedAt: 10
}

const capabilities: DorkaCloudCapabilities = {
  flags: { share: true },
  refreshedAt: 11
}

const organizations: DorkaCloudOrgSummary[] = [
  { orgId: 'org-1', name: 'Acme', role: 'Admin' },
  { orgId: 'org-2', name: 'Personal' }
]

function configureCloudEnv(): void {
  vi.stubEnv('DORKA_CLOUD_API_URL', 'https://dorka-cloud.example')
  vi.stubEnv('DORKA_CLOUD_CLIENT_ID', 'desktop-client')
}

function futureExpiresAt(): number {
  return Date.now() + 3_600_000
}

function mockSuccessfulConnect(expiresAt = futureExpiresAt()): void {
  beginDorkaCloudPkceFlowMock.mockResolvedValue({
    code: 'auth-code',
    codeVerifier: 'code-verifier',
    nonce: 'nonce',
    redirectUri: 'http://127.0.0.1:4100/auth/callback',
    state: 'state'
  })
  exchangeDorkaCloudAuthCodeMock.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt,
    cloud: cloudSummary,
    organizations,
    capabilities
  } satisfies DorkaCloudSessionExchangeResponse)
}

describe('Dorka cloud profile service', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-cloud-service-'))
    beginDorkaCloudPkceFlowMock.mockReset()
    createDorkaCloudProfileMock.mockReset()
    exchangeDorkaCloudAuthCodeMock.mockReset()
    revokeDorkaCloudSessionMock.mockReset()
    selectDorkaCloudOrgMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    revokeDorkaCloudSessionMock.mockResolvedValue(undefined)
    vi.unstubAllEnvs()
    vi.stubEnv('DORKA_CLOUD_API_URL', '')
    vi.stubEnv('DORKA_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('reports local unconfigured auth without cloud setup', () => {
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      activeProfileId: 'local-default',
      configured: false,
      state: 'unconfigured',
      persistence: 'none'
    })
  })

  it('connects the active local profile without replacing its local profile ID', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()

    const result = await connectCurrentDorkaProfile(userDataPath)

    if (result.status !== 'connected') {
      throw new Error(`Expected connected result, got ${result.status}`)
    }
    expect(result.activeProfileId).toBe('local-default')
    expect(result.profiles[0]).toMatchObject({
      id: 'local-default',
      kind: 'cloud-linked',
      cloud: cloudSummary
    })
    expect(exchangeDorkaCloudAuthCodeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ localProfileId: 'local-default', nonce: 'nonce' })
    )
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'connected',
      persistence: 'encrypted',
      cloud: cloudSummary,
      organizations,
      capabilities
    })
  })

  it('treats provider-denied sign-in as a cancelled connect attempt', async () => {
    configureCloudEnv()
    beginDorkaCloudPkceFlowMock.mockRejectedValue(new Error('dorka_cloud_auth_denied'))

    const result = await connectCurrentDorkaProfile(userDataPath)

    expect(result.status).toBe('cancelled')
    expect(exchangeDorkaCloudAuthCodeMock).not.toHaveBeenCalled()
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'local',
      persistence: 'none'
    })
  })

  it('reports callback failures as failed instead of cancelled', async () => {
    configureCloudEnv()
    beginDorkaCloudPkceFlowMock.mockRejectedValue(new Error('dorka_cloud_auth_callback_failed'))

    const result = await connectCurrentDorkaProfile(userDataPath)

    expect(result).toMatchObject({ status: 'failed', error: 'dorka_cloud_auth_callback_failed' })
    expect(exchangeDorkaCloudAuthCodeMock).not.toHaveBeenCalled()
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({ state: 'local' })
  })

  it('does not report a saved cloud session as connected when cloud config is unavailable', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentDorkaProfile(userDataPath)
    vi.stubEnv('DORKA_CLOUD_API_URL', '')
    vi.stubEnv('DORKA_CLOUD_CLIENT_ID', '')

    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      configured: false,
      state: 'unconfigured',
      persistence: 'encrypted',
      cloud: cloudSummary,
      setupMessage: 'Dorka Cloud sign-in is not configured for this build.'
    })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).organizations).toBeUndefined()
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).capabilities).toBeUndefined()
  })

  it('signs out by removing cloud metadata while keeping the local profile', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentDorkaProfile(userDataPath)

    const result = await signOutCurrentDorkaProfile(userDataPath)

    expect(result.status).toBe('signed-out')
    expect(result.activeProfileId).toBe('local-default')
    expect(result.profiles[0]).toMatchObject({ id: 'local-default', kind: 'local' })
    expect(result.profiles[0]?.cloud).toBeUndefined()
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'local',
      persistence: 'none'
    })
    expect(revokeDorkaCloudSessionMock).toHaveBeenCalledOnce()
  })

  it('creates a new empty cloud-linked profile with its own cloud session', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentDorkaProfile(userDataPath)
    createDorkaCloudProfileMock.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: 1000,
      cloud: {
        ...cloudSummary,
        cloudProfileId: 'cloud-profile-2',
        activeOrgId: 'org-1',
        activeOrgName: 'Acme'
      },
      organizations,
      capabilities: { flags: { share: true, team: true }, refreshedAt: 13 }
    } satisfies DorkaCloudSessionExchangeResponse)

    const result = await createCloudLinkedDorkaProfile(userDataPath, {
      orgId: 'org-1',
      name: 'Acme'
    })

    if (result.status !== 'created') {
      throw new Error(`Expected created result, got ${result.status}`)
    }
    expect(result.profile).toMatchObject({
      id: expect.stringMatching(/^cloud-/),
      name: 'Acme',
      kind: 'cloud-linked',
      cloud: expect.objectContaining({ cloudProfileId: 'cloud-profile-2' })
    })
    expect(createDorkaCloudProfileMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'access-token' }),
      { orgId: 'org-1', name: 'Acme' }
    )
  })

  it('selects an organization for a connected profile', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentDorkaProfile(userDataPath)
    const orgCloudSummary = {
      ...cloudSummary,
      activeOrgId: 'org-1',
      activeOrgName: 'Acme'
    }
    selectDorkaCloudOrgMock.mockResolvedValue({
      cloud: orgCloudSummary,
      organizations,
      capabilities: { flags: { share: true, sso: true }, refreshedAt: 12 }
    })

    const result = await selectCurrentDorkaProfileOrg(userDataPath, 'org-1')

    expect(result.status).toBe('selected')
    expect(selectDorkaCloudOrgMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'access-token' }),
      'org-1'
    )
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).cloud).toMatchObject({
      activeOrgId: 'org-1',
      activeOrgName: 'Acme'
    })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).organizations).toEqual(organizations)
  })
})
