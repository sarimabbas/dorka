import { DORKA_BROWSER_PARTITION } from './constants'
import type { ExecutionHostId } from './execution-host'

export const DORKA_PROFILE_INDEX_SCHEMA_VERSION = 1
export const DEFAULT_LOCAL_DORKA_PROFILE_ID = 'local-default'
export const DEFAULT_LOCAL_DORKA_PROFILE_NAME = 'Personal'
/** Main -> renderer push when the stored auth status changed without the renderer asking. */
export const DORKA_PROFILE_AUTH_STATUS_CHANGED_CHANNEL = 'dorkaProfiles:authStatusChanged'
const LEGACY_DORKA_BROWSER_SESSION_PARTITION_PREFIX = 'persist:dorka-browser-session-'

export type DorkaProfileAvatar = {
  kind: 'initials'
  initials: string
  color: 'neutral'
}

export type DorkaProfileKind = 'local' | 'cloud-linked'

export type DorkaProfileCloudSummary = {
  cloudProfileId: string
  userId: string
  email: string
  displayName?: string
  activeOrgId?: string
  activeOrgName?: string
  linkedAt: number
}

export type DorkaCloudOrgSummary = {
  orgId: string
  name: string
  role?: string
}

export type DorkaCloudCapabilityFlags = Record<string, boolean>

export type DorkaCloudCapabilities = {
  flags: DorkaCloudCapabilityFlags
  refreshedAt: number
}

export type DorkaCloudSessionPersistence = 'none' | 'encrypted' | 'memory-only' | 'dev-plaintext'

export type DorkaProfileAuthState = 'local' | 'unconfigured' | 'connected' | 'reconnect-required'

export type DorkaProfileAuthStatus = {
  activeProfileId: string
  configured: boolean
  state: DorkaProfileAuthState
  persistence: DorkaCloudSessionPersistence
  cloud?: DorkaProfileCloudSummary
  organizations?: DorkaCloudOrgSummary[]
  capabilities?: DorkaCloudCapabilities
  credentialError?: string
  setupMessage?: string
}

export type DorkaProfileSummary = {
  id: string
  name: string
  avatar: DorkaProfileAvatar
  kind: DorkaProfileKind
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  cloud?: DorkaProfileCloudSummary
}

export type DorkaProfileIndex = {
  schemaVersion: number
  activeProfileId: string
  profiles: DorkaProfileSummary[]
}

export type DorkaProfileListState = {
  activeProfileId: string
  profiles: DorkaProfileSummary[]
}

export type DorkaProfileListResult = DorkaProfileListState & {
  // Why: gates the full multi-profile switcher UI; default builds show a
  // single-profile account menu instead.
  multiProfileUi: boolean
}

export type CreateLocalDorkaProfileArgs = {
  name?: string
}

export type CreateLocalDorkaProfileResult = DorkaProfileListState & {
  profile: DorkaProfileSummary
}

export type CreateCloudLinkedDorkaProfileArgs = {
  orgId?: string
  name?: string
}

export type SwitchDorkaProfileArgs = {
  profileId: string
}

export type SwitchDorkaProfileResult = {
  status: 'already-active' | 'relaunching'
}

export type TransferDorkaProfileProjectMode = 'move' | 'copy'

export type TransferDorkaProfileProjectArgs = {
  sourceProfileId: string
  targetProfileId: string
  repoId: string
  mode: TransferDorkaProfileProjectMode
}

export type FindDorkaProfileProjectsByPathArgs = {
  path: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  excludeProfileId?: string | null
}

export type DorkaProfileProjectPresence = {
  profileId: string
  profileName: string
  profileKind: DorkaProfileKind
  repoId: string
  repoName: string
}

export type FindDorkaProfileProjectsByPathResult = {
  projects: DorkaProfileProjectPresence[]
}

export type TransferDorkaProfileProjectResult =
  | {
      status: 'transferred'
      mode: TransferDorkaProfileProjectMode
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      targetRepoId: string
      targetProjectId: string | null
      willRelaunch?: boolean
    }
  | {
      status: 'duplicate-target'
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      duplicateRepoId: string
    }

export type ConnectCurrentDorkaProfileResult =
  | {
      status: 'connected'
      auth: DorkaProfileAuthStatus
      activeProfileId: string
      profiles: DorkaProfileSummary[]
    }
  | {
      status: 'unconfigured'
      auth: DorkaProfileAuthStatus
    }
  | {
      status: 'cancelled'
      auth: DorkaProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: DorkaProfileAuthStatus
      error: string
    }

export type CreateCloudLinkedDorkaProfileResult =
  | {
      status: 'created'
      auth: DorkaProfileAuthStatus
      activeProfileId: string
      profiles: DorkaProfileSummary[]
      profile: DorkaProfileSummary
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: DorkaProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: DorkaProfileAuthStatus
      error: string
    }

export type SignOutCurrentDorkaProfileResult = {
  status: 'signed-out'
  auth: DorkaProfileAuthStatus
  activeProfileId: string
  profiles: DorkaProfileSummary[]
}

export type SelectDorkaProfileOrgArgs = {
  orgId: string
}

export type SelectDorkaProfileOrgResult =
  | {
      status: 'selected'
      auth: DorkaProfileAuthStatus
      activeProfileId: string
      profiles: DorkaProfileSummary[]
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: DorkaProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: DorkaProfileAuthStatus
      error: string
    }

export type RefreshCurrentDorkaProfileAuthResult =
  | {
      status: 'refreshed'
      auth: DorkaProfileAuthStatus
      activeProfileId: string
      profiles: DorkaProfileSummary[]
    }
  | {
      status: 'local' | 'unconfigured' | 'reconnect-required'
      auth: DorkaProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: DorkaProfileAuthStatus
      error: string
    }

// Why: organization roles are a fixed server-side enum; the desktop UI mirrors
// exactly these three so role selects can't drift from what the API accepts.
export type DorkaOrgRole = 'owner' | 'admin' | 'member'

export type DorkaOrgMember = {
  // Why: null for teammates provisioned server-side who never signed into Dorka;
  // mutation actions are disabled for them since the API keys on a real userId.
  userId: string | null
  email: string
  displayName?: string
  role: DorkaOrgRole
}

export type DorkaOrgPendingInvite = {
  email: string
  role: DorkaOrgRole
  createdAt: number
}

export type DorkaOrgMembersRoster = {
  members: DorkaOrgMember[]
  pendingInvites: DorkaOrgPendingInvite[]
  viewerRole: DorkaOrgRole
  canManageMembers: boolean
}

export type DorkaProfileOrgMembersListArgs = {
  orgId: string
}

export type DorkaProfileOrgMemberInviteArgs = {
  orgId: string
  email: string
  role: DorkaOrgRole
}

export type DorkaProfileOrgInviteRevokeArgs = {
  orgId: string
  email: string
}

export type DorkaProfileOrgMemberChangeRoleArgs = {
  orgId: string
  userId: string
  role: DorkaOrgRole
}

export type DorkaProfileOrgMemberRemoveArgs = {
  orgId: string
  userId: string
}

export type DorkaProfileOrgMembersListResult =
  | { status: 'ok'; roster: DorkaOrgMembersRoster }
  | { status: 'unconfigured' | 'reconnect-required' }
  | { status: 'failed'; error: string }

export type DorkaOrgInviteConflictReason = 'already_member' | 'already_invited'
export type DorkaOrgMutationInvalidReason = 'cannot_change_own_role' | 'cannot_remove_self'

export type DorkaProfileOrgMemberMutationResult =
  | { status: 'ok' }
  | { status: 'unconfigured' | 'reconnect-required' | 'forbidden' | 'not-found' }
  | { status: 'conflict'; reason: DorkaOrgInviteConflictReason }
  | { status: 'invalid'; reason: DorkaOrgMutationInvalidReason }
  | { status: 'failed'; error: string }

export function createDefaultLocalDorkaProfile(now: number): DorkaProfileSummary {
  return {
    id: DEFAULT_LOCAL_DORKA_PROFILE_ID,
    name: DEFAULT_LOCAL_DORKA_PROFILE_NAME,
    avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
    kind: 'local',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  }
}

function profilePartitionHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getDorkaProfileBrowserPartitionSegment(profileId: string): string {
  const safe = profileId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || 'profile'
  return `${safe}-${profilePartitionHash(profileId)}`
}

export function getDorkaProfileBrowserDefaultPartition(profileId: string): string {
  if (profileId === DEFAULT_LOCAL_DORKA_PROFILE_ID) {
    return DORKA_BROWSER_PARTITION
  }
  return `persist:dorka-profile-${getDorkaProfileBrowserPartitionSegment(profileId)}-browser-default`
}

export function getDorkaProfileBrowserSessionPartition(
  profileId: string,
  browserSessionProfileId: string
): string {
  if (profileId === DEFAULT_LOCAL_DORKA_PROFILE_ID) {
    return `${LEGACY_DORKA_BROWSER_SESSION_PARTITION_PREFIX}${browserSessionProfileId}`
  }
  return `persist:dorka-profile-${getDorkaProfileBrowserPartitionSegment(
    profileId
  )}-browser-session-${browserSessionProfileId}`
}
