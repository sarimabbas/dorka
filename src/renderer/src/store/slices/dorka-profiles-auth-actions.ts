import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  ConnectCurrentDorkaProfileResult,
  CreateCloudLinkedDorkaProfileResult,
  RefreshCurrentDorkaProfileAuthResult,
  SelectDorkaProfileOrgResult,
  SignOutCurrentDorkaProfileResult
} from '../../../../shared/dorka-profiles'
import type { AppState } from '../types'

export type DorkaProfilesAuthActions = {
  createCloudLinkedDorkaProfile: (args: {
    orgId?: string
    name?: string
  }) => Promise<CreateCloudLinkedDorkaProfileResult | null>
  connectCurrentDorkaProfile: () => Promise<ConnectCurrentDorkaProfileResult | null>
  refreshCurrentDorkaProfileAuth: () => Promise<RefreshCurrentDorkaProfileAuthResult | null>
  signOutCurrentDorkaProfile: () => Promise<SignOutCurrentDorkaProfileResult | null>
  selectDorkaProfileOrg: (orgId: string) => Promise<SelectDorkaProfileOrgResult | null>
}

// Why a separate module: the cloud-auth actions share the profiles slice's
// state keys but form their own cohesive surface (connect/refresh/sign-out/
// org selection), and the combined slice file exceeded the repo line budget.
export const createDorkaProfilesAuthActions: StateCreator<
  AppState,
  [],
  [],
  DorkaProfilesAuthActions
> = (set, get) => {
  let nextConnectAttempt = 0
  let appliedConnectAttempt = 0

  return {
    createCloudLinkedDorkaProfile: async (args) => {
      try {
        const result = await window.api.dorkaProfiles.createCloudLinked(args)
        set({
          dorkaProfileAuthStatus: result.auth,
          ...(result.status === 'created'
            ? {
                activeDorkaProfileId: result.activeProfileId,
                dorkaProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'created') {
          toast.success(
            translate('auto.store.slices.dorka.profiles.319d7cf39b', 'Cloud profile created')
          )
        } else if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.dorka.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.dorka.profiles.f0c9e11a6d',
              'Failed to create cloud profile'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to create Dorka cloud profile:', err)
        toast.error(
          translate(
            'auto.store.slices.dorka.profiles.f0c9e11a6d',
            'Failed to create cloud profile'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    connectCurrentDorkaProfile: async () => {
      const attempt = ++nextConnectAttempt
      try {
        // Why: a pending browser callback must not block retry. Another click
        // starts a second PKCE wait; an older wait is ignored after a newer
        // one has already linked.
        const result = await window.api.dorkaProfiles.connectCurrent()
        if (attempt < appliedConnectAttempt) {
          return result
        }
        const alreadyConnected = get().dorkaProfileAuthStatus?.state === 'connected'
        set({
          dorkaProfileAuthStatus: result.auth,
          ...(result.status === 'connected'
            ? {
                activeDorkaProfileId: result.activeProfileId,
                dorkaProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'connected') {
          appliedConnectAttempt = attempt
          if (!alreadyConnected) {
            toast.success(
              translate('auto.store.slices.dorka.profiles.9fcb07a796', 'Profile connected')
            )
          }
        } else if (result.status === 'unconfigured') {
          toast.error(
            translate(
              'auto.store.slices.dorka.profiles.8b8fa73174',
              'Dorka Cloud sign-in is not configured'
            ),
            {
              description: result.auth.setupMessage
            }
          )
        } else if (
          result.status === 'failed' &&
          !alreadyConnected &&
          result.auth.state !== 'connected'
        ) {
          toast.error(
            translate('auto.store.slices.dorka.profiles.33290e88ed', 'Failed to connect profile'),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to connect Dorka profile:', err)
        if (
          attempt >= appliedConnectAttempt &&
          get().dorkaProfileAuthStatus?.state !== 'connected'
        ) {
          toast.error(
            translate('auto.store.slices.dorka.profiles.33290e88ed', 'Failed to connect profile'),
            {
              description: err instanceof Error ? err.message : String(err)
            }
          )
        }
        return null
      }
    },

    refreshCurrentDorkaProfileAuth: async () => {
      try {
        const result = await window.api.dorkaProfiles.refreshAuth()
        set({
          dorkaProfileAuthStatus: result.auth,
          ...(result.status === 'refreshed'
            ? {
                activeDorkaProfileId: result.activeProfileId,
                dorkaProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.dorka.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.dorka.profiles.2f6c78a039',
              'Failed to refresh profile auth'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to refresh Dorka profile auth:', err)
        toast.error(
          translate(
            'auto.store.slices.dorka.profiles.2f6c78a039',
            'Failed to refresh profile auth'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    signOutCurrentDorkaProfile: async () => {
      nextConnectAttempt += 1
      appliedConnectAttempt = nextConnectAttempt
      try {
        const result = await window.api.dorkaProfiles.signOutCurrent()
        set({
          activeDorkaProfileId: result.activeProfileId,
          dorkaProfiles: result.profiles,
          dorkaProfileAuthStatus: result.auth
        })
        if (result.auth.state !== 'connected') {
          toast.success(
            translate('auto.store.slices.dorka.profiles.a37b5e6d37', 'Signed out of profile')
          )
        }
        return result
      } catch (err) {
        console.error('Failed to sign out of Dorka profile:', err)
        toast.error(
          translate('auto.store.slices.dorka.profiles.83600521e7', 'Failed to sign out'),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    selectDorkaProfileOrg: async (orgId) => {
      try {
        const result = await window.api.dorkaProfiles.selectOrg({ orgId })
        set({
          dorkaProfileAuthStatus: result.auth,
          ...(result.status === 'selected'
            ? {
                activeDorkaProfileId: result.activeProfileId,
                dorkaProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.dorka.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.dorka.profiles.76deec8f58',
              'Failed to switch organization'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to switch Dorka profile org:', err)
        toast.error(
          translate('auto.store.slices.dorka.profiles.76deec8f58', 'Failed to switch organization'),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    }
  }
}
