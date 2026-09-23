import type {
  CreateCloudLinkedDorkaProfileArgs,
  DorkaProfileListState
} from '../../shared/dorka-profiles'
import type { ActiveDorkaProfileState } from './profile-index-store'
import { createCloudLinkedDorkaProfileRecord, linkDorkaProfileToCloud } from './profile-cloud-index'
import { readDorkaCloudSession, saveDorkaCloudSessionExchange } from './profile-cloud-session-store'
import { createDevDorkaCloudSession } from './profile-cloud-dev-auth'

type DevProfileListResult = DorkaProfileListState

type DevCreateProfileResult =
  | {
      status: 'created'
      list: ReturnType<typeof createCloudLinkedDorkaProfileRecord>
    }
  | { status: 'reconnect-required' }

type DevMutationResult =
  | {
      status: 'updated'
      list: DevProfileListResult
    }
  | { status: 'reconnect-required' }

export function connectDevDorkaCloudProfile(
  active: ActiveDorkaProfileState,
  userDataPath: string
): DevProfileListResult {
  const session = createDevDorkaCloudSession({ localProfileId: active.profile.id })
  saveDorkaCloudSessionExchange(active.profile.id, userDataPath, session)
  return linkDorkaProfileToCloud(active.profile.id, session.cloud, userDataPath)
}

export function createDevCloudLinkedDorkaProfile(
  active: ActiveDorkaProfileState,
  userDataPath: string,
  args: CreateCloudLinkedDorkaProfileArgs
): DevCreateProfileResult {
  if (readDorkaCloudSession(active.profile.id, userDataPath).status !== 'found') {
    return { status: 'reconnect-required' }
  }
  const session = createDevDorkaCloudSession({ orgId: args.orgId })
  const list = createCloudLinkedDorkaProfileRecord(session.cloud, { name: args.name }, userDataPath)
  saveDorkaCloudSessionExchange(list.profile.id, userDataPath, session)
  return { status: 'created', list }
}

export function refreshDevDorkaCloudProfile(
  active: ActiveDorkaProfileState,
  userDataPath: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readDorkaCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevDorkaCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId: active.profile.cloud.activeOrgId
  })
  saveDorkaCloudSessionExchange(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkDorkaProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}

export function selectDevDorkaCloudOrg(
  active: ActiveDorkaProfileState,
  userDataPath: string,
  orgId: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readDorkaCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevDorkaCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId
  })
  saveDorkaCloudSessionExchange(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkDorkaProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}
