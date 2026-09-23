import type { PreloadApi } from '../../../../preload/api-types'
import {
  DEFAULT_LOCAL_DORKA_PROFILE_ID,
  createDefaultLocalDorkaProfile
} from '../../../../shared/dorka-profiles'
import { noopUnsubscribe } from './web-storage'

export function createWebDorkaProfilesApi(): Partial<PreloadApi> {
  const webDorkaProfileAuthStatus = () =>
    Promise.resolve({
      activeProfileId: DEFAULT_LOCAL_DORKA_PROFILE_ID,
      configured: false,
      state: 'unconfigured' as const,
      persistence: 'none' as const,
      setupMessage: 'Dorka Cloud sign-in is not available in the browser fallback.'
    })
  return {
    dorkaProfiles: {
      list: () =>
        Promise.resolve({
          activeProfileId: DEFAULT_LOCAL_DORKA_PROFILE_ID,
          profiles: [createDefaultLocalDorkaProfile(0)],
          multiProfileUi: false
        }),
      authStatus: webDorkaProfileAuthStatus,
      onAuthStatusChanged: () => noopUnsubscribe,
      createLocal: () =>
        Promise.resolve({
          activeProfileId: DEFAULT_LOCAL_DORKA_PROFILE_ID,
          profiles: [createDefaultLocalDorkaProfile(0)],
          profile: createDefaultLocalDorkaProfile(0)
        }),
      createCloudLinked: async () => ({
        status: 'unconfigured',
        auth: await webDorkaProfileAuthStatus()
      }),
      switchProfile: () => Promise.resolve({ status: 'already-active' }),
      transferProject: (args) =>
        Promise.resolve({
          status: 'duplicate-target',
          sourceProfileId: args.sourceProfileId,
          targetProfileId: args.targetProfileId,
          sourceRepoId: args.repoId,
          duplicateRepoId: args.repoId
        }),
      findProjectProfiles: async () => ({ projects: [] }),
      connectCurrent: async () => ({
        status: 'unconfigured',
        auth: await webDorkaProfileAuthStatus()
      }),
      refreshAuth: async () => ({
        status: 'unconfigured',
        auth: await webDorkaProfileAuthStatus()
      }),
      signOutCurrent: async () => ({
        status: 'signed-out',
        auth: await webDorkaProfileAuthStatus(),
        activeProfileId: DEFAULT_LOCAL_DORKA_PROFILE_ID,
        profiles: [createDefaultLocalDorkaProfile(0)]
      }),
      selectOrg: async () => ({
        status: 'unconfigured',
        auth: await webDorkaProfileAuthStatus()
      }),
      orgMembersList: async () => ({ status: 'unconfigured' }),
      orgMemberInvite: async () => ({ status: 'unconfigured' }),
      orgInviteRevoke: async () => ({ status: 'unconfigured' }),
      orgMemberChangeRole: async () => ({ status: 'unconfigured' }),
      orgMemberRemove: async () => ({ status: 'unconfigured' })
    }
  }
}
