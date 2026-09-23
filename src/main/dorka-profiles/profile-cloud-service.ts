import type {
  ConnectCurrentDorkaProfileResult,
  CreateCloudLinkedDorkaProfileArgs,
  CreateCloudLinkedDorkaProfileResult,
  DorkaProfileAuthStatus,
  SelectDorkaProfileOrgResult,
  SignOutCurrentDorkaProfileResult
} from '../../shared/dorka-profiles'
import { ensureActiveDorkaProfile } from './profile-index-store'
import { getDorkaCloudAuthConfig, isDorkaCloudDevAuthEnabled } from './profile-cloud-auth-config'
import {
  clearDorkaCloudSession,
  readDorkaCloudSession,
  saveDorkaCloudSessionExchange
} from './profile-cloud-session-store'
import { cloudSessionIdentity, tombstoneCloudSession } from './profile-cloud-session-mutation'
import {
  createDorkaCloudProfile,
  exchangeDorkaCloudAuthCode,
  revokeDorkaCloudSession
} from './profile-cloud-client'
import { beginDorkaCloudPkceFlow } from './profile-cloud-pkce'
import {
  createCloudLinkedDorkaProfileRecord,
  linkDorkaProfileToCloud,
  unlinkDorkaProfileFromCloud
} from './profile-cloud-index'
import { runWithFreshDorkaCloudSession } from './profile-cloud-session-refresh'
import {
  connectDevDorkaCloudProfile,
  createDevCloudLinkedDorkaProfile,
  selectDevDorkaCloudOrg
} from './profile-cloud-dev-service'
import { getDorkaProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { selectCloudOrgWithMutationFence } from './profile-cloud-org-selection'

export { refreshCurrentDorkaProfileAuth } from './profile-cloud-capability-refresh'

let nextCloudConnectAttempt = 0
let linkedCloudConnectAttempt = 0

function invalidateOutstandingCloudConnectAttempts(): void {
  nextCloudConnectAttempt += 1
  linkedCloudConnectAttempt = nextCloudConnectAttempt
}

function isUserCancelledAuthError(message: string): boolean {
  return message === 'dorka_cloud_auth_timeout' || message === 'dorka_cloud_auth_denied'
}

function activeAuth(
  active: ReturnType<typeof ensureActiveDorkaProfile>,
  userDataPath: string
): DorkaProfileAuthStatus {
  return getDorkaProfileAuthStatusFromProfile(active, userDataPath)
}

export function getCurrentDorkaProfileAuthStatus(userDataPath: string): DorkaProfileAuthStatus {
  return getDorkaProfileAuthStatusFromProfile(ensureActiveDorkaProfile(userDataPath), userDataPath)
}

export async function connectCurrentDorkaProfile(
  userDataPath: string
): Promise<ConnectCurrentDorkaProfileResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    const list = connectDevDorkaCloudProfile(active, userDataPath)
    return {
      status: 'connected',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  }

  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: activeAuth(active, userDataPath)
    }
  }

  const attempt = ++nextCloudConnectAttempt
  try {
    const code = await beginDorkaCloudPkceFlow(configState.config, active.profile.id)
    if (attempt < linkedCloudConnectAttempt) {
      return {
        status: 'cancelled',
        auth: getCurrentDorkaProfileAuthStatus(userDataPath)
      }
    }
    const exchange = await exchangeDorkaCloudAuthCode(configState.config, {
      ...code,
      localProfileId: active.profile.id
    })
    if (attempt < linkedCloudConnectAttempt) {
      return {
        status: 'cancelled',
        auth: getCurrentDorkaProfileAuthStatus(userDataPath)
      }
    }
    saveDorkaCloudSessionExchange(active.profile.id, userDataPath, exchange)
    const list = linkDorkaProfileToCloud(active.profile.id, exchange.cloud, userDataPath)
    linkedCloudConnectAttempt = attempt
    return {
      status: 'connected',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isUserCancelledAuthError(message)) {
      return {
        status: 'cancelled',
        auth: getCurrentDorkaProfileAuthStatus(userDataPath)
      }
    }
    return {
      status: 'failed',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      error: message
    }
  }
}

export async function signOutCurrentDorkaProfile(
  userDataPath: string
): Promise<SignOutCurrentDorkaProfileResult> {
  // Why: a Sign in click still waiting in the browser must not relink after
  // the user explicitly signed out.
  invalidateOutstandingCloudConnectAttempts()
  const signOutEpoch = linkedCloudConnectAttempt
  const active = ensureActiveDorkaProfile(userDataPath)
  const configState = getDorkaCloudAuthConfig()
  const session = readDorkaCloudSession(active.profile.id, userDataPath)
  if (active.profile.cloud) {
    // Why: persist the destructive fence before logout network I/O so a
    // refresh already in flight cannot save after explicit sign-out.
    tombstoneCloudSession(
      cloudSessionIdentity(active.profile.id, active.profile.cloud),
      userDataPath
    )
  }
  if (!isDorkaCloudDevAuthEnabled() && configState.configured && session.status === 'found') {
    await revokeDorkaCloudSession(configState.config, session.session).catch(() => undefined)
  }
  if (linkedCloudConnectAttempt > signOutEpoch) {
    const current = ensureActiveDorkaProfile(userDataPath)
    return {
      status: 'signed-out',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      activeProfileId: current.index.activeProfileId,
      profiles: current.index.profiles
    }
  }
  clearDorkaCloudSession(active.profile.id, userDataPath)
  const list = unlinkDorkaProfileFromCloud(active.profile.id, userDataPath)
  return {
    status: 'signed-out',
    auth: getCurrentDorkaProfileAuthStatus(userDataPath),
    activeProfileId: list.activeProfileId,
    profiles: list.profiles
  }
}

export async function createCloudLinkedDorkaProfile(
  userDataPath: string,
  args: CreateCloudLinkedDorkaProfileArgs
): Promise<CreateCloudLinkedDorkaProfileResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    const result = createDevCloudLinkedDorkaProfile(active, userDataPath, args)
    if (result.status !== 'created') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'created',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles,
      profile: result.list.profile
    }
  }

  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: activeAuth(active, userDataPath) }
  }
  try {
    const operation = await runWithFreshDorkaCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => createDorkaCloudProfile(configState.config, session, args)
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    const created = operation.value
    const list = createCloudLinkedDorkaProfileRecord(
      created.cloud,
      { name: args.name },
      userDataPath
    )
    saveDorkaCloudSessionExchange(list.profile.id, userDataPath, created)
    return {
      status: 'created',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles,
      profile: list.profile
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function selectCurrentDorkaProfileOrg(
  userDataPath: string,
  orgId: string
): Promise<SelectDorkaProfileOrgResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  if (isDorkaCloudDevAuthEnabled()) {
    const result = selectDevDorkaCloudOrg(active, userDataPath, orgId)
    if (result.status !== 'updated') {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'selected',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }

  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: activeAuth(active, userDataPath) }
  }
  try {
    const list = await selectCloudOrgWithMutationFence({
      config: configState.config,
      active,
      userDataPath,
      orgId
    })
    if (!list) {
      return { status: 'reconnect-required', auth: activeAuth(active, userDataPath) }
    }
    return {
      status: 'selected',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentDorkaProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
