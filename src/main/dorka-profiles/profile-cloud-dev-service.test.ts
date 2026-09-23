import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  refreshDorkaCloudCapabilities: vi.fn(),
  refreshDorkaCloudSession: vi.fn(),
  revokeDorkaCloudSession: revokeDorkaCloudSessionMock,
  selectDorkaCloudOrg: vi.fn()
}))

import {
  connectCurrentDorkaProfile,
  createCloudLinkedDorkaProfile,
  getCurrentDorkaProfileAuthStatus,
  selectCurrentDorkaProfileOrg,
  signOutCurrentDorkaProfile
} from './profile-cloud-service'

describe('Dorka cloud dev auth service', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-cloud-dev-auth-'))
    beginDorkaCloudPkceFlowMock.mockReset()
    exchangeDorkaCloudAuthCodeMock.mockReset()
    revokeDorkaCloudSessionMock.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf-8'))
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value, 'utf-8'))
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    vi.unstubAllEnvs()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DORKA_CLOUD_DEV_AUTH', '1')
    vi.stubEnv('DORKA_CLOUD_API_URL', '')
    vi.stubEnv('DORKA_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('connects the active profile without PKCE or cloud endpoints', async () => {
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      configured: true,
      state: 'local'
    })

    const result = await connectCurrentDorkaProfile(userDataPath)

    expect(result.status).toBe('connected')
    expect(beginDorkaCloudPkceFlowMock).not.toHaveBeenCalled()
    expect(exchangeDorkaCloudAuthCodeMock).not.toHaveBeenCalled()
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      configured: true,
      state: 'connected',
      persistence: 'encrypted',
      cloud: {
        cloudProfileId: 'dev-cloud-local-default',
        email: 'dev@dorka.local'
      },
      capabilities: {
        flags: expect.objectContaining({ 'share.create': true })
      }
    })
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).organizations).toHaveLength(2)
  })

  it('selects dev organizations and creates org-scoped cloud profiles locally', async () => {
    await connectCurrentDorkaProfile(userDataPath)

    const selected = await selectCurrentDorkaProfileOrg(userDataPath, 'dev-acme')
    const created = await createCloudLinkedDorkaProfile(userDataPath, {
      orgId: 'dev-acme',
      name: 'Acme Dev'
    })

    expect(selected.status).toBe('selected')
    expect(getCurrentDorkaProfileAuthStatus(userDataPath).cloud).toMatchObject({
      activeOrgId: 'dev-acme',
      activeOrgName: 'Acme Dev'
    })
    expect(created.status).toBe('created')
    if (created.status === 'created') {
      expect(created.profile).toMatchObject({
        name: 'Acme Dev',
        kind: 'cloud-linked',
        cloud: expect.objectContaining({
          activeOrgId: 'dev-acme',
          activeOrgName: 'Acme Dev'
        })
      })
    }
  })

  it('signs out locally without calling the cloud logout endpoint', async () => {
    await connectCurrentDorkaProfile(userDataPath)

    const result = await signOutCurrentDorkaProfile(userDataPath)

    expect(result.status).toBe('signed-out')
    expect(revokeDorkaCloudSessionMock).not.toHaveBeenCalled()
    expect(getCurrentDorkaProfileAuthStatus(userDataPath)).toMatchObject({
      configured: true,
      state: 'local',
      persistence: 'none'
    })
  })
})
