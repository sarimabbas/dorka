import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  DorkaCloudCapabilities,
  DorkaCloudOrgSummary,
  DorkaProfileCloudSummary
} from '../../shared/dorka-profiles'

const {
  beginDorkaCloudPkceFlowMock,
  exchangeDorkaCloudAuthCodeMock,
  revokeDorkaCloudSessionMock,
  safeStorageMock
} = vi.hoisted(() => ({
  beginDorkaCloudPkceFlowMock: vi.fn(),
  exchangeDorkaCloudAuthCodeMock: vi.fn(),
  revokeDorkaCloudSessionMock: vi.fn(),
  safeStorageMock: {
    decryptString: vi.fn((value: Buffer) => value.toString('utf-8')),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf-8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}))

let userDataPath = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataPath },
  safeStorage: safeStorageMock
}))

vi.mock('./profile-cloud-pkce', () => ({
  beginDorkaCloudPkceFlow: beginDorkaCloudPkceFlowMock
}))

vi.mock('./profile-cloud-client', () => ({
  createDorkaCloudProfile: vi.fn(),
  exchangeDorkaCloudAuthCode: exchangeDorkaCloudAuthCodeMock,
  revokeDorkaCloudSession: revokeDorkaCloudSessionMock,
  selectDorkaCloudOrg: vi.fn()
}))

import {
  connectCurrentDorkaProfile,
  getCurrentDorkaProfileAuthStatus,
  signOutCurrentDorkaProfile
} from './profile-cloud-service'

const cloud: DorkaProfileCloudSummary = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  displayName: 'Nina',
  linkedAt: 10
}

const laterCloud: DorkaProfileCloudSummary = {
  ...cloud,
  cloudProfileId: 'cloud-profile-2',
  email: 'ada@example.com'
}

const capabilities: DorkaCloudCapabilities = { flags: { share: true }, refreshedAt: 11 }
const organizations: DorkaCloudOrgSummary[] = [{ orgId: 'org-1', name: 'Acme', role: 'Admin' }]

describe('Dorka cloud sign-out vs newer connect', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-cloud-sign-out-connect-'))
    beginDorkaCloudPkceFlowMock.mockReset()
    exchangeDorkaCloudAuthCodeMock.mockReset()
    revokeDorkaCloudSessionMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.stubEnv('DORKA_CLOUD_API_URL', 'https://dorka-cloud.example')
    vi.stubEnv('DORKA_CLOUD_CLIENT_ID', 'desktop-client')
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
      expiresAt: Date.now() + 3_600_000,
      cloud,
      organizations,
      capabilities
    })
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('keeps a newer connect that finishes while sign-out is still revoking', async () => {
    await expect(connectCurrentDorkaProfile(userDataPath)).resolves.toMatchObject({
      status: 'connected'
    })
    let finishRevoke!: () => void
    revokeDorkaCloudSessionMock.mockReturnValue(
      new Promise<void>((resolve) => {
        finishRevoke = resolve
      })
    )
    const signingOut = signOutCurrentDorkaProfile(userDataPath)
    exchangeDorkaCloudAuthCodeMock.mockResolvedValue({
      accessToken: 'later-access',
      refreshToken: 'later-refresh',
      expiresAt: Date.now() + 3_600_000,
      cloud: laterCloud,
      organizations,
      capabilities
    })
    await expect(connectCurrentDorkaProfile(userDataPath)).resolves.toMatchObject({
      status: 'connected'
    })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')
    finishRevoke()
    await expect(signingOut).resolves.toMatchObject({ status: 'signed-out' })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      state: 'connected',
      cloud: { email: 'ada@example.com' }
    })
  })
})
