import type {
  DorkaProfileOrgInviteRevokeArgs,
  DorkaProfileOrgMemberChangeRoleArgs,
  DorkaProfileOrgMemberInviteArgs,
  DorkaProfileOrgMemberMutationResult,
  DorkaProfileOrgMemberRemoveArgs,
  DorkaProfileOrgMembersListResult
} from '../../shared/dorka-profiles'
import type { ActiveDorkaProfileState } from './profile-index-store'
import { ensureActiveDorkaProfile } from './profile-index-store'
import type { DorkaCloudAuthConfig } from './profile-cloud-auth-config'
import { getDorkaCloudAuthConfig, isDorkaCloudDevAuthEnabled } from './profile-cloud-auth-config'
import type { DorkaCloudSession } from './profile-cloud-session-store'
import { DorkaCloudRequestError } from './profile-cloud-client'
import { runWithFreshDorkaCloudSession } from './profile-cloud-session-refresh'
import {
  changeDorkaCloudOrgMemberRole,
  inviteDorkaCloudOrgMember,
  listDorkaCloudOrgMembers,
  removeDorkaCloudOrgMember,
  revokeDorkaCloudOrgInvite
} from './profile-cloud-org-members-client'
import {
  changeDevDorkaCloudOrgMemberRole,
  inviteDevDorkaCloudOrgMember,
  listDevDorkaCloudOrgMembers,
  removeDevDorkaCloudOrgMember,
  revokeDevDorkaCloudOrgInvite
} from './profile-cloud-dev-org-members'

type OrgCallResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'reconnect-required' }
  | { status: 'request-error'; error: DorkaCloudRequestError }
  | { status: 'failed'; error: string }

// Why: only a 401 means the token itself is stale and should drive a session
// refresh/reconnect. 403/404/409/400 are business or permission outcomes the UI
// must interpret, so they are surfaced as values rather than thrown — otherwise
// runWithFreshDorkaCloudSession would treat a 403 as an auth failure and burn a
// pointless token refresh + retry before giving up.
async function runOrgMemberCall<T>(
  config: DorkaCloudAuthConfig,
  active: ActiveDorkaProfileState,
  userDataPath: string,
  call: (session: DorkaCloudSession) => Promise<T>
): Promise<OrgCallResult<T>> {
  try {
    const operation = await runWithFreshDorkaCloudSession(
      config,
      active,
      userDataPath,
      async (session) => {
        try {
          return { ok: true as const, value: await call(session) }
        } catch (error) {
          if (error instanceof DorkaCloudRequestError && error.statusCode !== 401) {
            return { ok: false as const, error }
          }
          throw error
        }
      }
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required' }
    }
    const outcome = operation.value
    return outcome.ok
      ? { status: 'ok', value: outcome.value }
      : { status: 'request-error', error: outcome.error }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

function mapMutationRequestError(
  error: DorkaCloudRequestError
): DorkaProfileOrgMemberMutationResult {
  switch (error.statusCode) {
    case 403:
      return { status: 'forbidden' }
    case 404:
      return { status: 'not-found' }
    case 409:
      return {
        status: 'conflict',
        reason: error.errorCode === 'already_member' ? 'already_member' : 'already_invited'
      }
    case 400:
      return {
        status: 'invalid',
        reason:
          error.errorCode === 'cannot_remove_self' ? 'cannot_remove_self' : 'cannot_change_own_role'
      }
    default:
      return { status: 'failed', error: error.message }
  }
}

function mapMutationResult(result: OrgCallResult<void>): DorkaProfileOrgMemberMutationResult {
  switch (result.status) {
    case 'ok':
      return { status: 'ok' }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return mapMutationRequestError(result.error)
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function listDorkaProfileOrgMembers(
  userDataPath: string,
  orgId: string
): Promise<DorkaProfileOrgMembersListResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    return { status: 'ok', roster: listDevDorkaCloudOrgMembers(orgId) }
  }
  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  const result = await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
    listDorkaCloudOrgMembers(configState.config, session, orgId)
  )
  switch (result.status) {
    case 'ok':
      return { status: 'ok', roster: result.value }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return { status: 'failed', error: result.error.message }
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function inviteDorkaProfileOrgMember(
  userDataPath: string,
  args: DorkaProfileOrgMemberInviteArgs
): Promise<DorkaProfileOrgMemberMutationResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    return inviteDevDorkaCloudOrgMember(args)
  }
  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      inviteDorkaCloudOrgMember(configState.config, session, args)
    )
  )
}

export async function revokeDorkaProfileOrgInvite(
  userDataPath: string,
  args: DorkaProfileOrgInviteRevokeArgs
): Promise<DorkaProfileOrgMemberMutationResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    return revokeDevDorkaCloudOrgInvite(args)
  }
  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      revokeDorkaCloudOrgInvite(configState.config, session, args)
    )
  )
}

export async function changeDorkaProfileOrgMemberRole(
  userDataPath: string,
  args: DorkaProfileOrgMemberChangeRoleArgs
): Promise<DorkaProfileOrgMemberMutationResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    return changeDevDorkaCloudOrgMemberRole(args)
  }
  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      changeDorkaCloudOrgMemberRole(configState.config, session, args)
    )
  )
}

export async function removeDorkaProfileOrgMember(
  userDataPath: string,
  args: DorkaProfileOrgMemberRemoveArgs
): Promise<DorkaProfileOrgMemberMutationResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    return removeDevDorkaCloudOrgMember(args)
  }
  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      removeDorkaCloudOrgMember(configState.config, session, args)
    )
  )
}
