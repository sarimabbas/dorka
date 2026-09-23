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
  DorkaCloudRequestErrorMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginDorkaCloudPkceFlowMock: vi.fn(),
  createDorkaCloudProfileMock: vi.fn(),
  exchangeDorkaCloudAuthCodeMock: vi.fn(),
  refreshDorkaCloudCapabilitiesMock: vi.fn(),
  refreshDorkaCloudSessionMock: vi.fn(),
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
  isAmbiguousCloudRequestFailure: (error: unknown) =>
    !(error instanceof DorkaCloudRequestErrorMock),
  createDorkaCloudProfile: createDorkaCloudProfileMock,
  exchangeDorkaCloudAuthCode: exchangeDorkaCloudAuthCodeMock,
  refreshDorkaCloudCapabilities: refreshDorkaCloudCapabilitiesMock,
  refreshDorkaCloudSession: refreshDorkaCloudSessionMock,
  revokeDorkaCloudSession: vi.fn(),
  selectDorkaCloudOrg: vi.fn()
}))

import {
  connectCurrentDorkaProfile,
  createCloudLinkedDorkaProfile,
  getCurrentDorkaProfileAuthStatus,
  refreshCurrentDorkaProfileAuth
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

describe('Dorka cloud profile service session refresh', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-cloud-service-refresh-'))
    beginDorkaCloudPkceFlowMock.mockReset()
    createDorkaCloudProfileMock.mockReset()
    exchangeDorkaCloudAuthCodeMock.mockReset()
    refreshDorkaCloudCapabilitiesMock.mockReset()
    refreshDorkaCloudSessionMock.mockReset()
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

  it('refreshes an expired access token before creating cloud profiles', async () => {
    configureCloudEnv()
    mockSuccessfulConnect(Date.now() - 1_000)
    await connectCurrentDorkaProfile(userDataPath)
    refreshDorkaCloudSessionMock.mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: cloudSummary,
      organizations,
      capabilities
    } satisfies DorkaCloudSessionExchangeResponse)
    createDorkaCloudProfileMock.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: {
        ...cloudSummary,
        cloudProfileId: 'cloud-profile-2',
        activeOrgId: 'org-1',
        activeOrgName: 'Acme'
      },
      organizations,
      capabilities
    } satisfies DorkaCloudSessionExchangeResponse)

    const result = await createCloudLinkedDorkaProfile(userDataPath, {
      orgId: 'org-1',
      name: 'Acme'
    })

    expect(result.status).toBe('created')
    expect(refreshDorkaCloudSessionMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ refreshToken: 'refresh-token' })
    )
    expect(createDorkaCloudProfileMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
      { orgId: 'org-1', name: 'Acme' }
    )
  })

  it('refreshes capability flags for the connected profile', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    await connectCurrentDorkaProfile(userDataPath)
    refreshDorkaCloudCapabilitiesMock.mockResolvedValue({
      capabilities: {
        flags: { share: false, team: true },
        refreshedAt: 25
      }
    })

    const result = await refreshCurrentDorkaProfileAuth(userDataPath)

    expect(result.status).toBe('refreshed')
    expect(refreshDorkaCloudCapabilitiesMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ accessToken: 'access-token' })
    )
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).capabilities).toEqual({
      flags: { share: false, team: true },
      refreshedAt: 25
    })
  })

  it('clears stale active org metadata when capability refresh returns no active org', async () => {
    configureCloudEnv()
    mockSuccessfulConnect()
    exchangeDorkaCloudAuthCodeMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: futureExpiresAt(),
      cloud: { ...cloudSummary, activeOrgId: 'org-1', activeOrgName: 'Acme' },
      organizations,
      capabilities
    } satisfies DorkaCloudSessionExchangeResponse)
    await connectCurrentDorkaProfile(userDataPath)
    refreshDorkaCloudCapabilitiesMock.mockResolvedValue({
      cloud: cloudSummary,
      organizations: [],
      capabilities: {
        flags: { share: false },
        refreshedAt: 31
      }
    })

    const result = await refreshCurrentDorkaProfileAuth(userDataPath)
    const status = getCurrentDorkaProfileAuthStatus(userDataPath)

    expect(result.status).toBe('refreshed')
    expect(status.cloud?.activeOrgId).toBeUndefined()
    expect(status.cloud?.activeOrgName).toBeUndefined()
    expect(status.organizations).toEqual([])
    expect(status.capabilities).toEqual({
      flags: { share: false },
      refreshedAt: 31
    })
  })

  it('requires reconnect when an expired refresh token is rejected', async () => {
    configureCloudEnv()
    mockSuccessfulConnect(Date.now() - 1_000)
    await connectCurrentDorkaProfile(userDataPath)
    refreshDorkaCloudSessionMock.mockRejectedValue(new DorkaCloudRequestErrorMock(401))

    const result = await refreshCurrentDorkaProfileAuth(userDataPath)

    expect(result.status).toBe('reconnect-required')
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'reconnect-required',
      persistence: 'none',
      cloud: cloudSummary
    })
  })
})
