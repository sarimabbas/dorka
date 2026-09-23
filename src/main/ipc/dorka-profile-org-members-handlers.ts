import { ipcMain } from 'electron'
import type {
  DorkaOrgRole,
  DorkaProfileOrgInviteRevokeArgs,
  DorkaProfileOrgMemberChangeRoleArgs,
  DorkaProfileOrgMemberInviteArgs,
  DorkaProfileOrgMemberMutationResult,
  DorkaProfileOrgMemberRemoveArgs,
  DorkaProfileOrgMembersListArgs,
  DorkaProfileOrgMembersListResult
} from '../../shared/dorka-profiles'
import { getProfileUserDataPath } from '../dorka-profiles/profile-storage-paths'
import {
  changeDorkaProfileOrgMemberRole,
  inviteDorkaProfileOrgMember,
  listDorkaProfileOrgMembers,
  removeDorkaProfileOrgMember,
  revokeDorkaProfileOrgInvite
} from '../dorka-profiles/profile-cloud-org-members-service'

function orgMembersScopedArgs(args: unknown): { orgId: string; record: Record<string, unknown> } {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_dorka_profile_org_selection')
  }
  const record = args as Record<string, unknown>
  const orgId = typeof record.orgId === 'string' ? record.orgId.trim() : ''
  if (!orgId) {
    throw new Error('invalid_dorka_profile_org_selection')
  }
  return { orgId, record }
}

function orgRoleFromUnknown(value: unknown): DorkaOrgRole {
  if (value === 'owner' || value === 'admin' || value === 'member') {
    return value
  }
  throw new Error('invalid_dorka_org_role')
}

function orgEmailFromUnknown(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : ''
  if (!email) {
    throw new Error('invalid_dorka_org_member_email')
  }
  return email
}

function orgUserIdFromUnknown(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : ''
  if (!userId) {
    throw new Error('invalid_dorka_org_member_user')
  }
  return userId
}

function orgMemberInviteArgsFromUnknown(args: unknown): DorkaProfileOrgMemberInviteArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email), role: orgRoleFromUnknown(record.role) }
}

function orgInviteRevokeArgsFromUnknown(args: unknown): DorkaProfileOrgInviteRevokeArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email) }
}

function orgMemberChangeRoleArgsFromUnknown(args: unknown): DorkaProfileOrgMemberChangeRoleArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return {
    orgId,
    userId: orgUserIdFromUnknown(record.userId),
    role: orgRoleFromUnknown(record.role)
  }
}

function orgMemberRemoveArgsFromUnknown(args: unknown): DorkaProfileOrgMemberRemoveArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, userId: orgUserIdFromUnknown(record.userId) }
}

export function registerDorkaProfileOrgMemberHandlers(): void {
  ipcMain.handle(
    'dorkaProfiles:orgMembersList',
    async (
      _event,
      rawArgs: DorkaProfileOrgMembersListArgs
    ): Promise<DorkaProfileOrgMembersListResult> =>
      listDorkaProfileOrgMembers(getProfileUserDataPath(), orgMembersScopedArgs(rawArgs).orgId)
  )

  ipcMain.handle(
    'dorkaProfiles:orgMemberInvite',
    async (
      _event,
      rawArgs: DorkaProfileOrgMemberInviteArgs
    ): Promise<DorkaProfileOrgMemberMutationResult> =>
      inviteDorkaProfileOrgMember(getProfileUserDataPath(), orgMemberInviteArgsFromUnknown(rawArgs))
  )

  ipcMain.handle(
    'dorkaProfiles:orgInviteRevoke',
    async (
      _event,
      rawArgs: DorkaProfileOrgInviteRevokeArgs
    ): Promise<DorkaProfileOrgMemberMutationResult> =>
      revokeDorkaProfileOrgInvite(getProfileUserDataPath(), orgInviteRevokeArgsFromUnknown(rawArgs))
  )

  ipcMain.handle(
    'dorkaProfiles:orgMemberChangeRole',
    async (
      _event,
      rawArgs: DorkaProfileOrgMemberChangeRoleArgs
    ): Promise<DorkaProfileOrgMemberMutationResult> =>
      changeDorkaProfileOrgMemberRole(
        getProfileUserDataPath(),
        orgMemberChangeRoleArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'dorkaProfiles:orgMemberRemove',
    async (
      _event,
      rawArgs: DorkaProfileOrgMemberRemoveArgs
    ): Promise<DorkaProfileOrgMemberMutationResult> =>
      removeDorkaProfileOrgMember(getProfileUserDataPath(), orgMemberRemoveArgsFromUnknown(rawArgs))
  )
}
