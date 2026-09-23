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
  refreshDorkaCloudCapabilitiesMock,
  refreshDorkaCloudSessionMock,
  selectDorkaCloudOrgMock,
  DorkaCloudRequestErrorMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginDorkaCloudPkceFlowMock: vi.fn(),
  createDorkaCloudProfileMock: vi.fn(),
  exchangeDorkaCloudAuthCodeMock: vi.fn(),
  refreshDorkaCloudCapabilitiesMock: vi.fn(),
  refreshDorkaCloudSessionMock: vi.fn(),
  selectDorkaCloudOrgMock: vi.fn(),
  DorkaCloudRequestErrorMock: class DorkaCloudRequestError extends Error {
    constructor(public readonly statusCode: number) {
      super(`dorka_cloud_request_failed_${statusCode}`)
      this.name = 'DorkaCloudRequestError'
    }
  },
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
  DorkaCloudRequestError: DorkaCloudRequestErrorMock,
  isAmbiguousCloudRequestFailure: (error: unknown) => !(error instanceof DorkaCloudRequestErrorMock),
  createDorkaCloudProfile: createDorkaCloudProfileMock,
  exchangeDorkaCloudAuthCode: exchangeDorkaCloudAuthCodeMock,
  refreshDorkaCloudCapabilities: refreshDorkaCloudCapabilitiesMock,
  refreshDorkaCloudSession: refreshDorkaCloudSessionMock,
  revokeDorkaCloudSession: vi.fn(),
  selectDorkaCloudOrg: selectDorkaCloudOrgMock
}))

import {
  connectCurrentDorkaProfile,
  createCloudLinkedDorkaProfile,
  getCurrentDorkaProfileAuthStatus,
  refreshCurrentDorkaProfileAuth,
  selectCurrentDorkaProfileOrg
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

function futureExpiresAt(): number {
  return Date.now() + 3_600_000
}

function configureCloudEnv(): void {
  vi.stubEnv('DORKA_CLOUD_API_URL', 'https://dorka-cloud.example')
  vi.stubEnv('DORKA_CLOUD_CLIENT_ID', 'desktop-client')
}

function mockSuccessfulConnect(): void {
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
    expiresAt: futureExpiresAt(),
    cloud: cloudSummary,
    organizations,
    capabilities
  } satisfies DorkaCloudSessionExchangeResponse)
}

function mockSuccessfulSessionRefresh(): void {
  refreshDorkaCloudSessionMock.mockResolvedValue({
    accessToken: 'rotated-access-token',
    refreshToken: 'rotated-refresh-token',
    expiresAt: futureExpiresAt(),
    cloud: cloudSummary,
    organizations,
    capabilities
  } satisfies DorkaCloudSessionExchangeResponse)
}

describe('Dorka cloud profile auth-failure retry', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-cloud-service-auth-retry-'))
    beginDorkaCloudPkceFlowMock.mockReset()
    createDorkaCloudProfileMock.mockReset()
    exchangeDorkaCloudAuthCodeMock.mockReset()
    refreshDorkaCloudCapabilitiesMock.mockReset()
    refreshDorkaCloudSessionMock.mockReset()
    selectDorkaCloudOrgMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.unstubAllEnvs()
    vi.stubEnv('DORKA_CLOUD_API_URL', '')
    vi.stubEnv('DORKA_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('refreshes and retries cloud profile creation after an auth failure', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentDorkaProfile(userDataPath)
    createDorkaCloudProfileMock
      .mockRejectedValueOnce(new DorkaCloudRequestErrorMock(401))
      .mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: futureExpiresAt(),
        cloud: { ...cloudSummary, cloudProfileId: 'cloud-profile-2' },
        organizations,
        capabilities
      } satisfies DorkaCloudSessionExchangeResponse)

    const result = await createCloudLinkedDorkaProfile(userDataPath, { name: 'Acme' })

    expect(result.status).toBe('created')
    expect(createDorkaCloudProfileMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
      { name: 'Acme' }
    )
  })

  it('refreshes and retries capability refresh after an auth failure', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentDorkaProfile(userDataPath)
    refreshDorkaCloudCapabilitiesMock
      .mockRejectedValueOnce(new DorkaCloudRequestErrorMock(403))
      .mockResolvedValue({
        capabilities: { flags: { share: false }, refreshedAt: 26 } satisfies DorkaCloudCapabilities
      })

    const result = await refreshCurrentDorkaProfileAuth(userDataPath)

    expect(result.status).toBe('refreshed')
    expect(refreshDorkaCloudCapabilitiesMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' })
    )
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).capabilities).toEqual({
      flags: { share: false },
      refreshedAt: 26
    })
  })

  it('requires reconnect when a retried capability refresh is still unauthorized', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentDorkaProfile(userDataPath)
    refreshDorkaCloudCapabilitiesMock
      .mockRejectedValueOnce(new DorkaCloudRequestErrorMock(401))
      .mockRejectedValueOnce(new DorkaCloudRequestErrorMock(401))

    const result = await refreshCurrentDorkaProfileAuth(userDataPath)

    expect(result.status).toBe('reconnect-required')
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'reconnect-required',
      persistence: 'none',
      cloud: cloudSummary
    })
  })

  it('refreshes and retries organization selection after an auth failure', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    mockSuccessfulSessionRefresh()
    await connectCurrentDorkaProfile(userDataPath)
    selectDorkaCloudOrgMock
      .mockRejectedValueOnce(new DorkaCloudRequestErrorMock(401))
      .mockResolvedValue({
        cloud: { ...cloudSummary, activeOrgId: 'org-1', activeOrgName: 'Acme' },
        organizations,
        capabilities
      })

    const result = await selectCurrentDorkaProfileOrg(userDataPath, 'org-1')

    expect(result.status).toBe('selected')
    expect(selectDorkaCloudOrgMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
      'org-1'
    )
  })
})
