import type { RefreshCurrentDorkaProfileAuthResult } from '../../shared/dorka-profiles'
import { getDorkaCloudAuthConfig, isDorkaCloudDevAuthEnabled } from './profile-cloud-auth-config'
import { getDorkaProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { refreshDorkaCloudCapabilities } from './profile-cloud-client'
import { linkDorkaProfileToCloud } from './profile-cloud-index'
import { ensureActiveDorkaProfile, getDorkaProfileListState } from './profile-index-store'
import { refreshDevDorkaCloudProfile } from './profile-cloud-dev-service'
import {
  captureCloudSessionMutation,
  cloudSessionIdentity,
  recordCloudSessionIdentityMutationIfCurrent
} from './profile-cloud-session-mutation'
import { runWithFreshDorkaCloudSession } from './profile-cloud-session-refresh'
import {
  readDorkaCloudSession,
  saveDorkaCloudSessionIfCurrent
} from './profile-cloud-session-store'

export async function refreshCurrentDorkaProfileAuth(
  userDataPath: string
): Promise<RefreshCurrentDorkaProfileAuthResult> {
  const active = ensureActiveDorkaProfile(userDataPath)
  const auth = () => getDorkaProfileAuthStatusFromProfile(active, userDataPath)
  if (!active.profile.cloud) {
    return { status: 'local', auth: auth() }
  }
  if (isDorkaCloudDevAuthEnabled()) {
    const result = refreshDevDorkaCloudProfile(active, userDataPath)
    if (result.status !== 'updated') {
      return { status: 'reconnect-required', auth: auth() }
    }
    return {
      status: 'refreshed',
      auth: auth(),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }
  const configState = getDorkaCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: auth() }
  }
  try {
    const identity = cloudSessionIdentity(active.profile.id, active.profile.cloud)
    let mutationSnapshot = captureCloudSessionMutation(identity, userDataPath)
    const operation = await runWithFreshDorkaCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => refreshDorkaCloudCapabilities(configState.config, session)
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required', auth: auth() }
    }
    const refresh = operation.value
    if (refresh.cloud) {
      const refreshedIdentity = cloudSessionIdentity(active.profile.id, refresh.cloud)
      if (
        refreshedIdentity.cloudUserId !== identity.cloudUserId ||
        refreshedIdentity.cloudProfileId !== identity.cloudProfileId
      ) {
        throw new Error('dorka_cloud_identity_changed_during_capability_refresh')
      }
      if (refreshedIdentity.organizationId !== identity.organizationId) {
        const advanced = recordCloudSessionIdentityMutationIfCurrent(
          refreshedIdentity,
          userDataPath,
          mutationSnapshot
        )
        if (!advanced) {
          return { status: 'reconnect-required', auth: auth() }
        }
        mutationSnapshot = advanced
      }
    }
    const session = readDorkaCloudSession(active.profile.id, userDataPath)
    if (session.status !== 'found') {
      return { status: 'reconnect-required', auth: auth() }
    }
    if (
      saveDorkaCloudSessionIfCurrent(
        active.profile.id,
        userDataPath,
        {
          ...session.session,
          organizations: refresh.organizations ?? session.session.organizations,
          capabilities: refresh.capabilities
        },
        mutationSnapshot
      ) === null
    ) {
      return { status: 'reconnect-required', auth: auth() }
    }
    const list = refresh.cloud
      ? linkDorkaProfileToCloud(active.profile.id, refresh.cloud, userDataPath)
      : getDorkaProfileListState(userDataPath)
    return {
      status: 'refreshed',
      auth: getDorkaProfileAuthStatusFromProfile(
        ensureActiveDorkaProfile(userDataPath),
        userDataPath
      ),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: auth(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
