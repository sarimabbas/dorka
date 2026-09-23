import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  listDorkaProfileOrgMembersMock,
  inviteDorkaProfileOrgMemberMock,
  revokeDorkaProfileOrgInviteMock,
  changeDorkaProfileOrgMemberRoleMock,
  removeDorkaProfileOrgMemberMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>(),
  listDorkaProfileOrgMembersMock: vi.fn(),
  inviteDorkaProfileOrgMemberMock: vi.fn(),
  revokeDorkaProfileOrgInviteMock: vi.fn(),
  changeDorkaProfileOrgMemberRoleMock: vi.fn(),
  removeDorkaProfileOrgMemberMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../dorka-profiles/profile-storage-paths', () => ({
  getProfileUserDataPath: () => '/tmp/dorka-user-data'
}))

vi.mock('../dorka-profiles/profile-cloud-org-members-service', () => ({
  listDorkaProfileOrgMembers: listDorkaProfileOrgMembersMock,
  inviteDorkaProfileOrgMember: inviteDorkaProfileOrgMemberMock,
  revokeDorkaProfileOrgInvite: revokeDorkaProfileOrgInviteMock,
  changeDorkaProfileOrgMemberRole: changeDorkaProfileOrgMemberRoleMock,
  removeDorkaProfileOrgMember: removeDorkaProfileOrgMemberMock
}))

import { registerDorkaProfileOrgMemberHandlers } from './dorka-profile-org-members-handlers'

function invoke(channel: string, args?: unknown): unknown {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler for ${channel}`)
  }
  return handler({}, args)
}

describe('registerDorkaProfileOrgMemberHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    listDorkaProfileOrgMembersMock.mockReset().mockResolvedValue({ status: 'ok', roster: {} })
    inviteDorkaProfileOrgMemberMock.mockReset().mockResolvedValue({ status: 'ok' })
    revokeDorkaProfileOrgInviteMock.mockReset().mockResolvedValue({ status: 'ok' })
    changeDorkaProfileOrgMemberRoleMock.mockReset().mockResolvedValue({ status: 'ok' })
    removeDorkaProfileOrgMemberMock.mockReset().mockResolvedValue({ status: 'ok' })
    registerDorkaProfileOrgMemberHandlers()
  })

  it('registers all five org-member channels', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        'dorkaProfiles:orgInviteRevoke',
        'dorkaProfiles:orgMemberChangeRole',
        'dorkaProfiles:orgMemberInvite',
        'dorkaProfiles:orgMemberRemove',
        'dorkaProfiles:orgMembersList'
      ].sort()
    )
  })

  it('forwards a valid invite to the service with a trimmed email', async () => {
    await invoke('dorkaProfiles:orgMemberInvite', {
      orgId: 'org-1',
      email: '  new@example.com  ',
      role: 'admin'
    })
    expect(inviteDorkaProfileOrgMemberMock).toHaveBeenCalledWith('/tmp/dorka-user-data', {
      orgId: 'org-1',
      email: 'new@example.com',
      role: 'admin'
    })
  })

  it('rejects an invite with a missing org id', async () => {
    await expect(
      invoke('dorkaProfiles:orgMemberInvite', { email: 'a@b.com', role: 'member' })
    ).rejects.toThrow('invalid_dorka_profile_org_selection')
    expect(inviteDorkaProfileOrgMemberMock).not.toHaveBeenCalled()
  })

  it('rejects an invite with an unknown role', async () => {
    await expect(
      invoke('dorkaProfiles:orgMemberInvite', { orgId: 'org-1', email: 'a@b.com', role: 'root' })
    ).rejects.toThrow('invalid_dorka_org_role')
  })

  it('rejects a role change with a blank user id', async () => {
    await expect(
      invoke('dorkaProfiles:orgMemberChangeRole', { orgId: 'org-1', userId: '  ', role: 'admin' })
    ).rejects.toThrow('invalid_dorka_org_member_user')
  })

  it('forwards remove and revoke with validated args', async () => {
    await invoke('dorkaProfiles:orgMemberRemove', { orgId: 'org-1', userId: 'user-2' })
    expect(removeDorkaProfileOrgMemberMock).toHaveBeenCalledWith('/tmp/dorka-user-data', {
      orgId: 'org-1',
      userId: 'user-2'
    })
    await invoke('dorkaProfiles:orgInviteRevoke', { orgId: 'org-1', email: 'gone@b.com' })
    expect(revokeDorkaProfileOrgInviteMock).toHaveBeenCalledWith('/tmp/dorka-user-data', {
      orgId: 'org-1',
      email: 'gone@b.com'
    })
  })
})
