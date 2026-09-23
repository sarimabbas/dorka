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
  app: {
    getPath: () => userDataPath
  },
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

const earlierCloud: DorkaProfileCloudSummary = {
  cloudProfileId: 'cloud-profile-1',
  userId: 'user-1',
  email: 'nina@example.com',
  displayName: 'Nina',
  linkedAt: 10
}

const laterCloud: DorkaProfileCloudSummary = {
  ...earlierCloud,
  cloudProfileId: 'cloud-profile-2',
  userId: 'user-2',
  email: 'ada@example.com'
}

const capabilities: DorkaCloudCapabilities = {
  flags: { share: true },
  refreshedAt: 11
}

const organizations: DorkaCloudOrgSummary[] = [{ orgId: 'org-1', name: 'Acme', role: 'Admin' }]

describe('Dorka cloud overlapping connect', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-cloud-connect-overlap-'))
    beginDorkaCloudPkceFlowMock.mockReset()
    exchangeDorkaCloudAuthCodeMock.mockReset()
    revokeDorkaCloudSessionMock.mockReset()
    revokeDorkaCloudSessionMock.mockResolvedValue(undefined)
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.stubEnv('DORKA_CLOUD_API_URL', 'https://dorka-cloud.example')
    vi.stubEnv('DORKA_CLOUD_CLIENT_ID', 'desktop-client')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('does not let an earlier sign-in overwrite a later successful connect', async () => {
    let finishFirst!: (value: {
      code: string
      codeVerifier: string
      nonce: string
      redirectUri: string
      state: string
    }) => void
    beginDorkaCloudPkceFlowMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve
        })
      )
      .mockResolvedValueOnce({
        code: 'later-code',
        codeVerifier: 'later-verifier',
        nonce: 'later-nonce',
        redirectUri: 'http://127.0.0.1:4101/auth/callback',
        state: 'later-state'
      })
    exchangeDorkaCloudAuthCodeMock.mockImplementation(async (_config, args) => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3_600_000,
      cloud: args.code === 'later-code' ? laterCloud : earlierCloud,
      organizations,
      capabilities
    }))

    const first = connectCurrentDorkaProfile(userDataPath)
    const later = connectCurrentDorkaProfile(userDataPath)
    await expect(later).resolves.toMatchObject({ status: 'connected' })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')

    finishFirst({
      code: 'earlier-code',
      codeVerifier: 'earlier-verifier',
      nonce: 'earlier-nonce',
      redirectUri: 'http://127.0.0.1:4100/auth/callback',
      state: 'earlier-state'
    })
    await expect(first).resolves.toMatchObject({ status: 'cancelled' })
    expect(exchangeDorkaCloudAuthCodeMock).toHaveBeenCalledTimes(1)
    expect(exchangeDorkaCloudAuthCodeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ code: 'later-code' })
    )
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')
  })

  it('discards an earlier token exchange that finishes after a later wait has linked', async () => {
    type PkceCode = {
      code: string
      codeVerifier: string
      nonce: string
      redirectUri: string
      state: string
    }
    let finishEarlierPkce!: (value: PkceCode) => void
    let finishLaterPkce!: (value: PkceCode) => void
    let finishEarlierExchange!: (value: {
      accessToken: string
      refreshToken: string
      expiresAt: number
      cloud: DorkaProfileCloudSummary
      organizations: DorkaCloudOrgSummary[]
      capabilities: DorkaCloudCapabilities
    }) => void
    let finishLaterExchange!: (value: {
      accessToken: string
      refreshToken: string
      expiresAt: number
      cloud: DorkaProfileCloudSummary
      organizations: DorkaCloudOrgSummary[]
      capabilities: DorkaCloudCapabilities
    }) => void
    beginDorkaCloudPkceFlowMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishEarlierPkce = resolve
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishLaterPkce = resolve
        })
      )
    exchangeDorkaCloudAuthCodeMock.mockImplementation(
      (_config, args) =>
        new Promise((resolve) => {
          if (args.code === 'later-code') {
            finishLaterExchange = resolve
          } else {
            finishEarlierExchange = resolve
          }
        })
    )

    const earlier = connectCurrentDorkaProfile(userDataPath)
    const later = connectCurrentDorkaProfile(userDataPath)
    finishEarlierPkce({
      code: 'earlier-code',
      codeVerifier: 'earlier-verifier',
      nonce: 'earlier-nonce',
      redirectUri: 'http://127.0.0.1:4100/auth/callback',
      state: 'earlier-state'
    })
    finishLaterPkce({
      code: 'later-code',
      codeVerifier: 'later-verifier',
      nonce: 'later-nonce',
      redirectUri: 'http://127.0.0.1:4101/auth/callback',
      state: 'later-state'
    })
    await vi.waitFor(() => expect(exchangeDorkaCloudAuthCodeMock).toHaveBeenCalledTimes(2))

    finishLaterExchange({
      accessToken: 'later-access',
      refreshToken: 'later-refresh',
      expiresAt: Date.now() + 3_600_000,
      cloud: laterCloud,
      organizations,
      capabilities
    })
    await expect(later).resolves.toMatchObject({ status: 'connected' })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')

    finishEarlierExchange({
      accessToken: 'earlier-access',
      refreshToken: 'earlier-refresh',
      expiresAt: Date.now() + 3_600_000,
      cloud: earlierCloud,
      organizations,
      capabilities
    })
    await expect(earlier).resolves.toMatchObject({ status: 'cancelled' })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).cloud?.email).toBe('ada@example.com')
  })

  it('does not relink an in-flight later wait after sign-out', async () => {
    type PkceCode = {
      code: string
      codeVerifier: string
      nonce: string
      redirectUri: string
      state: string
    }
    let finishEarlierPkce!: (value: PkceCode) => void
    let finishLaterPkce!: (value: PkceCode) => void
    beginDorkaCloudPkceFlowMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishEarlierPkce = resolve
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishLaterPkce = resolve
        })
      )
    exchangeDorkaCloudAuthCodeMock.mockImplementation(async (_config, args) => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3_600_000,
      cloud: args.code === 'later-code' ? laterCloud : earlierCloud,
      organizations,
      capabilities
    }))

    const earlier = connectCurrentDorkaProfile(userDataPath)
    const later = connectCurrentDorkaProfile(userDataPath)
    finishEarlierPkce({
      code: 'earlier-code',
      codeVerifier: 'earlier-verifier',
      nonce: 'earlier-nonce',
      redirectUri: 'http://127.0.0.1:4100/auth/callback',
      state: 'earlier-state'
    })
    await expect(earlier).resolves.toMatchObject({ status: 'connected' })
    await expect(signOutCurrentDorkaProfile(userDataPath)).resolves.toMatchObject({
      status: 'signed-out'
    })
    finishLaterPkce({
      code: 'later-code',
      codeVerifier: 'later-verifier',
      nonce: 'later-nonce',
      redirectUri: 'http://127.0.0.1:4101/auth/callback',
      state: 'later-state'
    })
    await expect(later).resolves.toMatchObject({ status: 'cancelled' })
    expect(exchangeDorkaCloudAuthCodeMock).toHaveBeenCalledTimes(1)
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({ state: 'local' })
  })
})
