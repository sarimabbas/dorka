import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DorkaOrgMembersRoster } from '../../shared/dorka-profiles'
import { DorkaCloudRequestError } from './profile-cloud-client'

const {
  runWithFreshDorkaCloudSessionMock,
  listDorkaCloudOrgMembersMock,
  inviteDorkaCloudOrgMemberMock,
  revokeDorkaCloudOrgInviteMock,
  changeDorkaCloudOrgMemberRoleMock,
  removeDorkaCloudOrgMemberMock
} = vi.hoisted(() => ({
  runWithFreshDorkaCloudSessionMock: vi.fn(),
  listDorkaCloudOrgMembersMock: vi.fn(),
  inviteDorkaCloudOrgMemberMock: vi.fn(),
  revokeDorkaCloudOrgInviteMock: vi.fn(),
  changeDorkaCloudOrgMemberRoleMock: vi.fn(),
  removeDorkaCloudOrgMemberMock: vi.fn()
}))

let userDataPath = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataPath }
}))

vi.mock('./profile-cloud-session-refresh', () => ({
  runWithFreshDorkaCloudSessionMock,
  runWithFreshDorkaCloudSession: runWithFreshDorkaCloudSessionMock
}))

vi.mock('./profile-cloud-org-members-client', () => ({
  listDorkaCloudOrgMembers: listDorkaCloudOrgMembersMock,
  inviteDorkaCloudOrgMember: inviteDorkaCloudOrgMemberMock,
  revokeDorkaCloudOrgInvite: revokeDorkaCloudOrgInviteMock,
  changeDorkaCloudOrgMemberRole: changeDorkaCloudOrgMemberRoleMock,
  removeDorkaCloudOrgMember: removeDorkaCloudOrgMemberMock
}))

import {
  changeDorkaProfileOrgMemberRole,
  inviteDorkaProfileOrgMember,
  listDorkaProfileOrgMembers,
  removeDorkaProfileOrgMember,
  revokeDorkaProfileOrgInvite
} from './profile-cloud-org-members-service'

const fakeSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 3_600_000,
  capabilities: { flags: {}, refreshedAt: 1 }
}

// Why: mirror the real contract — invoke the operation with a live session and
// surface its resolved value; business 4xx are returned by the operation as
// values, never thrown, so the session layer never sees them.
function runOperationDirectly(): void {
  runWithFreshDorkaCloudSessionMock.mockImplementation(
    async (
      _config: unknown,
      _active: unknown,
      _path: unknown,
      op: (session: unknown) => unknown
    ) => ({
      status: 'ok',
      value: await op(fakeSession)
    })
  )
}

function configureCloudEnv(): void {
  vi.stubEnv('DORKA_CLOUD_API_URL', 'https://dorka-cloud.example')
  vi.stubEnv('DORKA_CLOUD_CLIENT_ID', 'desktop-client')
}

const roster: DorkaOrgMembersRoster = {
  members: [{ userId: 'user-1', email: 'nina@example.com', role: 'owner' }],
  pendingInvites: [],
  viewerRole: 'owner',
  canManageMembers: true
}

describe('Dorka cloud org members service (configured)', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-org-members-'))
    runWithFreshDorkaCloudSessionMock.mockReset()
    listDorkaCloudOrgMembersMock.mockReset()
    inviteDorkaCloudOrgMemberMock.mockReset()
    revokeDorkaCloudOrgInviteMock.mockReset()
    changeDorkaCloudOrgMemberRoleMock.mockReset()
    removeDorkaCloudOrgMemberMock.mockReset()
    vi.unstubAllEnvs()
    vi.stubEnv('DORKA_CLOUD_DEV_AUTH', '')
    vi.stubEnv('DORKA_CLOUD_API_URL', '')
    vi.stubEnv('DORKA_CLOUD_CLIENT_ID', '')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('reports unconfigured when cloud sign-in is not set up', async () => {
    await expect(listDorkaProfileOrgMembers(userDataPath, 'org-1')).resolves.toEqual({
      status: 'unconfigured'
    })
    expect(runWithFreshDorkaCloudSessionMock).not.toHaveBeenCalled()
  })

  it('returns the roster from the client', async () => {
    configureCloudEnv()
    runOperationDirectly()
    listDorkaCloudOrgMembersMock.mockResolvedValue(roster)

    await expect(listDorkaProfileOrgMembers(userDataPath, 'org-1')).resolves.toEqual({
      status: 'ok',
      roster
    })
    expect(listDorkaCloudOrgMembersMock).toHaveBeenCalledWith(
      expect.any(Object),
      fakeSession,
      'org-1'
    )
  })

  it('maps a 409 already_member invite conflict', async () => {
    configureCloudEnv()
    runOperationDirectly()
    inviteDorkaCloudOrgMemberMock.mockRejectedValue(new DorkaCloudRequestError(409, 'already_member'))

    await expect(
      inviteDorkaProfileOrgMember(userDataPath, { orgId: 'org-1', email: 'a@b.com', role: 'member' })
    ).resolves.toEqual({ status: 'conflict', reason: 'already_member' })
  })

  it('maps a 403 role change to forbidden', async () => {
    configureCloudEnv()
    runOperationDirectly()
    changeDorkaCloudOrgMemberRoleMock.mockRejectedValue(new DorkaCloudRequestError(403))

    await expect(
      changeDorkaProfileOrgMemberRole(userDataPath, {
        orgId: 'org-1',
        userId: 'user-2',
        role: 'admin'
      })
    ).resolves.toEqual({ status: 'forbidden' })
  })

  it('maps a 400 cannot_remove_self to an invalid result', async () => {
    configureCloudEnv()
    runOperationDirectly()
    removeDorkaCloudOrgMemberMock.mockRejectedValue(
      new DorkaCloudRequestError(400, 'cannot_remove_self')
    )

    await expect(
      removeDorkaProfileOrgMember(userDataPath, { orgId: 'org-1', userId: 'user-1' })
    ).resolves.toEqual({ status: 'invalid', reason: 'cannot_remove_self' })
  })

  it('maps a 404 revoke to not-found', async () => {
    configureCloudEnv()
    runOperationDirectly()
    revokeDorkaCloudOrgInviteMock.mockRejectedValue(new DorkaCloudRequestError(404))

    await expect(
      revokeDorkaProfileOrgInvite(userDataPath, { orgId: 'org-1', email: 'gone@b.com' })
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('reports reconnect-required when the session layer cannot refresh', async () => {
    configureCloudEnv()
    runWithFreshDorkaCloudSessionMock.mockResolvedValue({ status: 'reconnect-required' })

    await expect(listDorkaProfileOrgMembers(userDataPath, 'org-1')).resolves.toEqual({
      status: 'reconnect-required'
    })
  })
})

describe('Dorka cloud org members service (dev auth)', () => {
  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'dorka-org-members-dev-'))
    runWithFreshDorkaCloudSessionMock.mockReset()
    vi.unstubAllEnvs()
    vi.stubEnv('DORKA_CLOUD_DEV_AUTH', '1')
  })

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('serves an in-memory roster the caller can manage', async () => {
    const result = await listDorkaProfileOrgMembers(userDataPath, 'dev-list-org')
    if (result.status !== 'ok') {
      throw new Error(`Expected ok, got ${result.status}`)
    }
    expect(result.roster.canManageMembers).toBe(true)
    expect(result.roster.viewerRole).toBe('owner')
    expect(result.roster.members[0]).toMatchObject({ role: 'owner' })
    expect(result.roster.members.some((member) => member.userId === null)).toBe(true)
    expect(result.roster.pendingInvites.length).toBeGreaterThan(0)
    expect(runWithFreshDorkaCloudSessionMock).not.toHaveBeenCalled()
  })

  it('mutates the dev roster across invite and revoke', async () => {
    const orgId = 'dev-mutate-org'
    await expect(
      inviteDorkaProfileOrgMember(userDataPath, {
        orgId,
        email: 'fresh@dorka.local',
        role: 'member'
      })
    ).resolves.toEqual({ status: 'ok' })

    const afterInvite = await listDorkaProfileOrgMembers(userDataPath, orgId)
    if (afterInvite.status !== 'ok') {
      throw new Error('expected ok')
    }
    expect(afterInvite.roster.pendingInvites.some((i) => i.email === 'fresh@dorka.local')).toBe(true)

    await expect(
      inviteDorkaProfileOrgMember(userDataPath, {
        orgId,
        email: 'fresh@dorka.local',
        role: 'member'
      })
    ).resolves.toEqual({ status: 'conflict', reason: 'already_invited' })

    await expect(
      revokeDorkaProfileOrgInvite(userDataPath, { orgId, email: 'fresh@dorka.local' })
    ).resolves.toEqual({ status: 'ok' })
    await expect(
      revokeDorkaProfileOrgInvite(userDataPath, { orgId, email: 'fresh@dorka.local' })
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('blocks changing the dev owner (self) role', async () => {
    const orgId = 'dev-self-org'
    const list = await listDorkaProfileOrgMembers(userDataPath, orgId)
    if (list.status !== 'ok') {
      throw new Error('expected ok')
    }
    const self = list.roster.members.find((member) => member.role === 'owner')
    await expect(
      changeDorkaProfileOrgMemberRole(userDataPath, {
        orgId,
        userId: self?.userId ?? 'dev-user',
        role: 'member'
      })
    ).resolves.toEqual({ status: 'invalid', reason: 'cannot_change_own_role' })
  })
})
