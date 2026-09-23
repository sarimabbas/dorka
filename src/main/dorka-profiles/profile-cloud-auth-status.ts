import type { DorkaProfileAuthStatus } from '../../shared/dorka-profiles'
import type { ActiveDorkaProfileState } from './profile-index-store'
import { getDorkaCloudAuthConfig, isDorkaCloudDevAuthEnabled } from './profile-cloud-auth-config'
import { readDorkaCloudSession } from './profile-cloud-session-store'

export function getDorkaProfileAuthStatusFromProfile(
  active: ActiveDorkaProfileState,
  userDataPath: string
): DorkaProfileAuthStatus {
  const configState = getDorkaCloudAuthConfig()
  const devAuthEnabled = isDorkaCloudDevAuthEnabled()
  const configured = configState.configured || devAuthEnabled
  const cloud = active.profile.cloud
  if (!cloud) {
    return {
      activeProfileId: active.profile.id,
      configured,
      state: configured ? 'local' : 'unconfigured',
      persistence: 'none',
      setupMessage: configured ? undefined : configState.setupMessage
    }
  }

  const session = readDorkaCloudSession(active.profile.id, userDataPath)
  if (!configured) {
    return {
      activeProfileId: active.profile.id,
      configured: false,
      state: 'unconfigured',
      persistence: session.status === 'found' ? session.persistence : 'none',
      cloud,
      credentialError:
        session.status === 'decrypt-failed' || session.status === 'unreadable'
          ? session.error
          : undefined,
      setupMessage: configState.setupMessage
    }
  }
  if (session.status === 'found') {
    return {
      activeProfileId: active.profile.id,
      configured,
      state: 'connected',
      persistence: session.persistence,
      cloud,
      organizations: session.session.organizations,
      capabilities: session.session.capabilities
    }
  }

  return {
    activeProfileId: active.profile.id,
    configured,
    state: 'reconnect-required',
    persistence: 'none',
    cloud,
    credentialError:
      session.status === 'decrypt-failed' || session.status === 'unreadable'
        ? session.error
        : undefined
  }
}
