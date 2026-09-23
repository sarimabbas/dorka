import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import { relaunchApp, type AppRelaunchReason } from '../app-relaunch'
import type {
  CreateLocalDorkaProfileArgs,
  CreateLocalDorkaProfileResult,
  CreateCloudLinkedDorkaProfileArgs,
  CreateCloudLinkedDorkaProfileResult,
  FindDorkaProfileProjectsByPathArgs,
  FindDorkaProfileProjectsByPathResult,
  DorkaProfileListResult,
  RefreshCurrentDorkaProfileAuthResult,
  SwitchDorkaProfileArgs,
  SwitchDorkaProfileResult,
  TransferDorkaProfileProjectArgs,
  TransferDorkaProfileProjectResult,
  ConnectCurrentDorkaProfileResult,
  DorkaProfileAuthStatus,
  SelectDorkaProfileOrgArgs,
  SelectDorkaProfileOrgResult,
  SignOutCurrentDorkaProfileResult
} from '../../shared/dorka-profiles'
import {
  createLocalDorkaProfile,
  getDorkaProfileListState,
  seedNewDorkaProfileTelemetryConsent,
  setActiveDorkaProfile
} from '../dorka-profiles/profile-index-store'
import {
  cloudSessionIdentity,
  recordCloudSessionIdentityMutation
} from '../dorka-profiles/profile-cloud-session-mutation'
import { getProfileUserDataPath } from '../dorka-profiles/profile-storage-paths'
import { isMultiProfileUiEnabled } from '../dorka-profiles/profile-ui-scope'
import { transferDorkaProfileProject } from '../dorka-profiles/profile-project-transfer'
import { findDorkaProfileProjectsByPath } from '../dorka-profiles/profile-project-presence'
import { flushActiveProfileBeforeFileMutation } from '../dorka-profiles/profile-persistence-deadline'
import { normalizeExecutionHostId } from '../../shared/execution-host'
import {
  createCloudLinkedDorkaProfile,
  connectCurrentDorkaProfile,
  getCurrentDorkaProfileAuthStatus,
  refreshCurrentDorkaProfileAuth,
  selectCurrentDorkaProfileOrg,
  signOutCurrentDorkaProfile
} from '../dorka-profiles/profile-cloud-service'
import { registerDorkaProfileOrgMemberHandlers } from './dorka-profile-org-members-handlers'
import { onDorkaCloudSessionInvalidated } from '../dorka-profiles/profile-cloud-session-invalidation'
import { broadcastDorkaProfileAuthStatusChanged } from './dorka-profile-auth-status-broadcast'

type RegisterDorkaProfileHandlersOptions = {
  onBeforeRelaunch?: () => void | Promise<void>
  onAuthMutation?: () => void
  onBeforeSignOut?: () => void
}

function profileIdFromArgs(args: unknown): string {
  if (
    !args ||
    typeof args !== 'object' ||
    typeof (args as SwitchDorkaProfileArgs).profileId !== 'string'
  ) {
    throw new Error('invalid_dorka_profile_id')
  }
  const profileId = (args as SwitchDorkaProfileArgs).profileId.trim()
  if (!profileId) {
    throw new Error('invalid_dorka_profile_id')
  }
  return profileId
}

function transferProjectArgsFromUnknown(args: unknown): TransferDorkaProfileProjectArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_dorka_profile_project_transfer')
  }
  const candidate = args as TransferDorkaProfileProjectArgs
  const sourceProfileId = candidate.sourceProfileId?.trim()
  const targetProfileId = candidate.targetProfileId?.trim()
  const repoId = candidate.repoId?.trim()
  const mode = candidate.mode
  if (!sourceProfileId || !targetProfileId || !repoId || (mode !== 'move' && mode !== 'copy')) {
    throw new Error('invalid_dorka_profile_project_transfer')
  }
  return {
    sourceProfileId,
    targetProfileId,
    repoId,
    mode
  }
}

function findProjectsByPathArgsFromUnknown(args: unknown): FindDorkaProfileProjectsByPathArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_dorka_profile_project_path')
  }
  const candidate = args as FindDorkaProfileProjectsByPathArgs
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : ''
  if (!path) {
    throw new Error('invalid_dorka_profile_project_path')
  }
  let executionHostId: FindDorkaProfileProjectsByPathArgs['executionHostId'] = null
  if (candidate.executionHostId !== null && candidate.executionHostId !== undefined) {
    if (typeof candidate.executionHostId !== 'string') {
      throw new Error('invalid_dorka_profile_project_path')
    }
    executionHostId = normalizeExecutionHostId(candidate.executionHostId)
    if (!executionHostId) {
      throw new Error('invalid_dorka_profile_project_path')
    }
  }
  return {
    path,
    connectionId:
      typeof candidate.connectionId === 'string' ? candidate.connectionId.trim() || null : null,
    executionHostId,
    excludeProfileId:
      typeof candidate.excludeProfileId === 'string'
        ? candidate.excludeProfileId.trim() || null
        : null
  }
}

function orgIdFromUnknown(args: unknown): string {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_dorka_profile_org_selection')
  }
  const orgId = (args as SelectDorkaProfileOrgArgs).orgId?.trim()
  if (!orgId) {
    throw new Error('invalid_dorka_profile_org_selection')
  }
  return orgId
}

function createCloudLinkedProfileArgsFromUnknown(args: unknown): CreateCloudLinkedDorkaProfileArgs {
  if (!args || typeof args !== 'object') {
    return {}
  }
  const candidate = args as CreateCloudLinkedDorkaProfileArgs
  const orgId = typeof candidate.orgId === 'string' ? candidate.orgId.trim() : undefined
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined
  return {
    ...(orgId ? { orgId } : {}),
    ...(name ? { name } : {})
  }
}

async function runBeforeProfileRelaunch(
  onBeforeRelaunch?: () => void | Promise<void>
): Promise<void> {
  try {
    await onBeforeRelaunch?.()
  } catch (error) {
    console.warn(
      '[dorka-profiles] Pre-relaunch cleanup failed; continuing profile switch:',
      error instanceof Error ? error.name : typeof error
    )
  }
}

function scheduleProfileRelaunch(reason: Extract<AppRelaunchReason, `profile-${string}`>): void {
  setTimeout(() => {
    relaunchApp(reason)
    // Why: app.quit() (not app.exit) so before-quit/will-quit still run —
    // renderer scrollback capture, PTY kill, stats flush, and daemon final
    // checkpoints must not be skipped on a profile switch.
    app.quit()
  }, 150)
}

export function registerDorkaProfileHandlers(
  store: Store,
  options: RegisterDorkaProfileHandlersOptions = {}
): void {
  ipcMain.handle('dorkaProfiles:list', (): DorkaProfileListResult => ({
    ...getDorkaProfileListState(),
    multiProfileUi: isMultiProfileUiEnabled()
  }))

  ipcMain.handle('dorkaProfiles:authStatus', (): DorkaProfileAuthStatus =>
    getCurrentDorkaProfileAuthStatus(getProfileUserDataPath())
  )

  // Why: a background refresh can revoke the session with no renderer request in
  // flight, so push the change instead of waiting for the next pane to ask.
  // Why not options.onAuthMutation: that hook drives the relay coordinator, which
  // is the caller that just failed the refresh — re-entering it here would be a loop.
  onDorkaCloudSessionInvalidated(broadcastDorkaProfileAuthStatusChanged)

  ipcMain.handle(
    'dorkaProfiles:createLocal',
    (_event, args?: CreateLocalDorkaProfileArgs): CreateLocalDorkaProfileResult => {
      const result = createLocalDorkaProfile(args)
      seedNewDorkaProfileTelemetryConsent(result.profile.id, store.getSettings().telemetry)
      return result
    }
  )

  ipcMain.handle(
    'dorkaProfiles:switch',
    async (_event, args: SwitchDorkaProfileArgs): Promise<SwitchDorkaProfileResult> => {
      const profileId = profileIdFromArgs(args)
      const current = getDorkaProfileListState()
      if (profileId === current.activeProfileId) {
        return { status: 'already-active' }
      }

      const activeProfile = current.profiles.find(
        (profile) => profile.id === current.activeProfileId
      )
      if (activeProfile?.cloud) {
        // Why: profile selection changes the expected identity synchronously;
        // stale refresh saves must fail even before relaunch teardown finishes.
        recordCloudSessionIdentityMutation(
          cloudSessionIdentity(activeProfile.id, activeProfile.cloud),
          getProfileUserDataPath()
        )
      }
      // Why: the current profile must be persisted before the global index
      // points startup at the target profile.
      await flushActiveProfileBeforeFileMutation(store)
      await runBeforeProfileRelaunch(options.onBeforeRelaunch)
      setActiveDorkaProfile(profileId)

      scheduleProfileRelaunch('profile-switch')

      return { status: 'relaunching' }
    }
  )

  ipcMain.handle(
    'dorkaProfiles:transferProject',
    async (
      _event,
      rawArgs: TransferDorkaProfileProjectArgs
    ): Promise<TransferDorkaProfileProjectResult> => {
      const args = transferProjectArgsFromUnknown(rawArgs)
      const current = getDorkaProfileListState()
      if (args.targetProfileId === current.activeProfileId) {
        throw new Error('active_target_dorka_profile_transfer_requires_relaunch')
      }
      if (args.mode === 'move' && args.sourceProfileId === current.activeProfileId) {
        // Why: transfer before any relaunch side effect so a duplicate-target
        // or validation failure cannot strand the app in a quitting state.
        await flushActiveProfileBeforeFileMutation(store)
        const result = transferDorkaProfileProject(args, getProfileUserDataPath())
        if (result.status === 'transferred') {
          store.freezeWrites()
          await runBeforeProfileRelaunch(options.onBeforeRelaunch)
          setActiveDorkaProfile(args.targetProfileId)
          scheduleProfileRelaunch('profile-transfer')
          return { ...result, willRelaunch: true }
        }
        return result
      }
      await flushActiveProfileBeforeFileMutation(store)
      return transferDorkaProfileProject(args, getProfileUserDataPath())
    }
  )

  ipcMain.handle(
    'dorkaProfiles:findProjectProfiles',
    (_event, rawArgs: FindDorkaProfileProjectsByPathArgs): FindDorkaProfileProjectsByPathResult =>
      findDorkaProfileProjectsByPath(
        findProjectsByPathArgsFromUnknown(rawArgs),
        getProfileUserDataPath()
      )
  )

  ipcMain.handle(
    'dorkaProfiles:connectCurrent',
    async (): Promise<ConnectCurrentDorkaProfileResult> => {
      const result = await connectCurrentDorkaProfile(getProfileUserDataPath())
      if (result.status === 'connected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'dorkaProfiles:createCloudLinked',
    async (
      _event,
      rawArgs?: CreateCloudLinkedDorkaProfileArgs
    ): Promise<CreateCloudLinkedDorkaProfileResult> => {
      const result = await createCloudLinkedDorkaProfile(
        getProfileUserDataPath(),
        createCloudLinkedProfileArgsFromUnknown(rawArgs)
      )
      if (result.status === 'created') {
        seedNewDorkaProfileTelemetryConsent(result.profile.id, store.getSettings().telemetry)
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'dorkaProfiles:refreshAuth',
    async (): Promise<RefreshCurrentDorkaProfileAuthResult> => {
      const result = await refreshCurrentDorkaProfileAuth(getProfileUserDataPath())
      if (result.status === 'refreshed') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'dorkaProfiles:signOutCurrent',
    async (): Promise<SignOutCurrentDorkaProfileResult> => {
      options.onBeforeSignOut?.()
      return signOutCurrentDorkaProfile(getProfileUserDataPath())
    }
  )

  ipcMain.handle(
    'dorkaProfiles:selectOrg',
    async (_event, rawArgs: SelectDorkaProfileOrgArgs): Promise<SelectDorkaProfileOrgResult> => {
      const result = await selectCurrentDorkaProfileOrg(
        getProfileUserDataPath(),
        orgIdFromUnknown(rawArgs)
      )
      if (result.status === 'selected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  registerDorkaProfileOrgMemberHandlers()
}
