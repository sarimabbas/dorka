import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  DorkaProfileAuthStatus,
  DorkaProfileSummary,
  SwitchDorkaProfileResult,
  TransferDorkaProfileProjectArgs,
  TransferDorkaProfileProjectResult
} from '../../../../shared/dorka-profiles'
import type { AppState } from '../types'
import {
  createDorkaProfilesAuthActions,
  type DorkaProfilesAuthActions
} from './dorka-profiles-auth-actions'

export type DorkaProfilesSlice = DorkaProfilesAuthActions & {
  dorkaProfiles: DorkaProfileSummary[]
  activeDorkaProfileId: string | null
  dorkaProfileAuthStatus: DorkaProfileAuthStatus | null
  dorkaProfilesMultiProfileUi: boolean
  dorkaProfilesLoading: boolean
  dorkaProfileSwitching: boolean
  fetchDorkaProfiles: () => Promise<void>
  fetchDorkaProfileAuthStatus: () => Promise<DorkaProfileAuthStatus | null>
  createLocalDorkaProfile: (name?: string) => Promise<DorkaProfileSummary | null>
  switchDorkaProfile: (profileId: string) => Promise<SwitchDorkaProfileResult | null>
  transferDorkaProfileProject: (
    args: TransferDorkaProfileProjectArgs
  ) => Promise<TransferDorkaProfileProjectResult | null>
}

export const createDorkaProfilesSlice: StateCreator<AppState, [], [], DorkaProfilesSlice> = (
  set,
  get,
  api
) => ({
  dorkaProfiles: [],
  activeDorkaProfileId: null,
  dorkaProfileAuthStatus: null,
  dorkaProfilesMultiProfileUi: false,
  dorkaProfilesLoading: false,
  dorkaProfileSwitching: false,

  fetchDorkaProfiles: async () => {
    set({ dorkaProfilesLoading: true })
    try {
      const [state, authStatus] = await Promise.all([
        window.api.dorkaProfiles.list(),
        window.api.dorkaProfiles.authStatus()
      ])
      set({
        activeDorkaProfileId: state.activeProfileId,
        dorkaProfiles: state.profiles,
        dorkaProfilesMultiProfileUi: state.multiProfileUi,
        dorkaProfileAuthStatus: authStatus,
        dorkaProfilesLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch Dorka profiles:', err)
      set({ dorkaProfilesLoading: false })
    }
  },

  fetchDorkaProfileAuthStatus: async () => {
    try {
      const authStatus = await window.api.dorkaProfiles.authStatus()
      set({ dorkaProfileAuthStatus: authStatus })
      return authStatus
    } catch (err) {
      console.error('Failed to fetch Dorka profile auth status:', err)
      return null
    }
  },

  createLocalDorkaProfile: async (name) => {
    try {
      const state = await window.api.dorkaProfiles.createLocal({ name })
      set({
        activeDorkaProfileId: state.activeProfileId,
        dorkaProfiles: state.profiles
      })
      void get().fetchDorkaProfileAuthStatus()
      return state.profile
    } catch (err) {
      console.error('Failed to create Dorka profile:', err)
      toast.error(
        translate('auto.store.slices.dorka.profiles.612f7f6861', 'Failed to create profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  ...createDorkaProfilesAuthActions(set, get, api),

  switchDorkaProfile: async (profileId) => {
    if (!profileId || profileId === get().activeDorkaProfileId) {
      return { status: 'already-active' }
    }
    set({ dorkaProfileSwitching: true })
    try {
      const result = await window.api.dorkaProfiles.switchProfile({ profileId })
      if (result?.status !== 'relaunching') {
        // Why: only a relaunch may keep the switcher locked; a stale
        // "already-active" answer would otherwise disable it forever.
        set({ dorkaProfileSwitching: false })
      }
      return result
    } catch (err) {
      console.error('Failed to switch Dorka profile:', err)
      set({ dorkaProfileSwitching: false })
      toast.error(
        translate('auto.store.slices.dorka.profiles.7d4bc516ee', 'Failed to switch profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  transferDorkaProfileProject: async (args) => {
    try {
      const result = await window.api.dorkaProfiles.transferProject(args)
      if (result.status === 'duplicate-target') {
        toast.error(
          translate(
            'auto.store.slices.dorka.profiles.f518e89aa5',
            'Project already exists in that profile'
          )
        )
      }
      if (result.status === 'transferred' && result.willRelaunch) {
        set({ dorkaProfileSwitching: true })
      }
      return result
    } catch (err) {
      console.error('Failed to transfer Dorka profile project:', err)
      toast.error(
        translate('auto.store.slices.dorka.profiles.f03ae7f27b', 'Failed to transfer project'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  }
})
