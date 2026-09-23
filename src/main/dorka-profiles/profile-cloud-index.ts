import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type {
  DorkaProfileCloudSummary,
  DorkaProfileListState,
  DorkaProfileSummary
} from '../../shared/dorka-profiles'
import {
  getDorkaProfileDirectory,
  getDorkaProfileIndexPath,
  loadOrCreateProfileIndex,
  writeProfileIndex
} from './profile-index-store'
import {
  artifactCloudCleanupNeedsCommit,
  commitArtifactCloudCleanup,
  completeArtifactCloudCleanupIfCommitted,
  prepareArtifactCloudCleanup
} from './profile-artifact-cloud-cleanup'

export type CreateCloudLinkedDorkaProfileRecordResult = DorkaProfileListState & {
  profile: DorkaProfileSummary
}

function sanitizeProfileName(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return (trimmed || fallback).slice(0, 80)
}

function profileInitial(name: string): string {
  return (name.match(/[A-Za-z0-9]/)?.[0] ?? 'C').toUpperCase()
}

function toCloudLinkedProfile(
  profile: DorkaProfileSummary,
  cloud: DorkaProfileCloudSummary,
  now: number
): DorkaProfileSummary {
  return {
    ...profile,
    kind: 'cloud-linked',
    cloud,
    updatedAt: now,
    lastOpenedAt: now
  }
}

function toLocalProfile(profile: DorkaProfileSummary, now: number): DorkaProfileSummary {
  const { cloud: _cloud, ...localProfile } = profile
  return {
    ...localProfile,
    kind: 'local',
    updatedAt: now,
    lastOpenedAt: now
  }
}

function reconcileCurrentArtifactCloudCleanup(
  profileId: string,
  userDataPath: string,
  currentCloud: DorkaProfileCloudSummary | undefined
): void {
  completeArtifactCloudCleanupIfCommitted(profileId, userDataPath, currentCloud)
  if (!artifactCloudCleanupNeedsCommit(profileId, userDataPath, currentCloud)) {
    return
  }
  commitArtifactCloudCleanup(profileId, userDataPath, currentCloud)
  completeArtifactCloudCleanupIfCommitted(profileId, userDataPath, currentCloud)
}

export function createCloudLinkedDorkaProfileRecord(
  cloud: DorkaProfileCloudSummary,
  args: { name?: string },
  userDataPath: string
): CreateCloudLinkedDorkaProfileRecordResult {
  const index = loadOrCreateProfileIndex(userDataPath)
  const now = Date.now()
  const fallbackName = cloud.activeOrgName ?? cloud.displayName ?? cloud.email
  const name = sanitizeProfileName(args.name, fallbackName)
  const profile: DorkaProfileSummary = {
    id: `cloud-${randomUUID()}`,
    name,
    avatar: {
      kind: 'initials',
      initials: profileInitial(name),
      color: 'neutral'
    },
    kind: 'cloud-linked',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    cloud
  }
  const nextIndex = {
    ...index,
    profiles: [...index.profiles, profile]
  }
  mkdirSync(getDorkaProfileDirectory(profile.id, userDataPath), { recursive: true })
  writeProfileIndex(getDorkaProfileIndexPath(userDataPath), nextIndex)
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles,
    profile
  }
}

export function linkDorkaProfileToCloud(
  profileId: string,
  cloud: DorkaProfileCloudSummary,
  userDataPath: string
): DorkaProfileListState {
  const index = loadOrCreateProfileIndex(userDataPath)
  const currentProfile = index.profiles.find((profile) => profile.id === profileId)
  if (!currentProfile) {
    throw new Error('unknown_dorka_profile')
  }
  reconcileCurrentArtifactCloudCleanup(profileId, userDataPath, currentProfile.cloud)
  const cleanupNeedsCommit = artifactCloudCleanupNeedsCommit(profileId, userDataPath, cloud)
  const now = Date.now()
  let found = false
  let cloudIdentityChanged = false
  const profiles = index.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile
    }
    found = true
    cloudIdentityChanged = Boolean(
      profile.cloud &&
      (profile.cloud.userId !== cloud.userId ||
        profile.cloud.cloudProfileId !== cloud.cloudProfileId ||
        (profile.cloud.activeOrgId ?? '') !== (cloud.activeOrgId ?? ''))
    )
    return toCloudLinkedProfile(profile, cloud, now)
  })
  if (!found) {
    throw new Error('unknown_dorka_profile')
  }
  if (cloudIdentityChanged || cleanupNeedsCommit) {
    prepareArtifactCloudCleanup(profileId, userDataPath, cloud)
  }
  const nextIndex = {
    ...index,
    profiles
  }
  writeProfileIndex(getDorkaProfileIndexPath(userDataPath), nextIndex)
  if (cloudIdentityChanged || cleanupNeedsCommit) {
    commitArtifactCloudCleanup(profileId, userDataPath, cloud)
    completeArtifactCloudCleanupIfCommitted(profileId, userDataPath, cloud)
  }
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles
  }
}

export function unlinkDorkaProfileFromCloud(
  profileId: string,
  userDataPath: string
): DorkaProfileListState {
  const index = loadOrCreateProfileIndex(userDataPath)
  const currentProfile = index.profiles.find((profile) => profile.id === profileId)
  if (!currentProfile) {
    throw new Error('unknown_dorka_profile')
  }
  reconcileCurrentArtifactCloudCleanup(profileId, userDataPath, currentProfile.cloud)
  const now = Date.now()
  let found = false
  const profiles = index.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile
    }
    found = true
    return toLocalProfile(profile, now)
  })
  if (!found) {
    throw new Error('unknown_dorka_profile')
  }
  prepareArtifactCloudCleanup(profileId, userDataPath, undefined)
  const nextIndex = {
    ...index,
    profiles
  }
  writeProfileIndex(getDorkaProfileIndexPath(userDataPath), nextIndex)
  commitArtifactCloudCleanup(profileId, userDataPath, undefined)
  completeArtifactCloudCleanupIfCommitted(profileId, userDataPath, undefined)
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles
  }
}
