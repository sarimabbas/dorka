import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { isUnreadableError, writeSecureJsonFile } from '../../shared/secure-file'
import type {
  DorkaCloudCapabilities,
  DorkaCloudOrgSummary,
  DorkaCloudSessionPersistence
} from '../../shared/dorka-profiles'
import { getDorkaProfileDirectory } from './profile-storage-paths'
import { allowsPlaintextDorkaCloudSession } from './profile-cloud-auth-config'
import type { DorkaCloudSessionExchangeResponse } from './profile-cloud-session-exchange'
import {
  cloudSessionIdentity,
  isCloudSessionMutationCurrent,
  recordSuccessfulCloudSessionLogin,
  type CloudSessionMutationSnapshot
} from './profile-cloud-session-mutation'

export type DorkaCloudSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  capabilities: DorkaCloudCapabilities
  organizations?: DorkaCloudOrgSummary[]
}

export type DorkaCloudSessionReadResult =
  | { status: 'found'; session: DorkaCloudSession; persistence: DorkaCloudSessionPersistence }
  | { status: 'missing'; persistence: 'none' }
  | { status: 'decrypt-failed'; persistence: 'none'; error: string }
  /**
   * The file is there and this process may not read it. Distinct from `decrypt-failed` because
   * that one means "read it, it was garbage" and licenses replacing it; this one licenses nothing.
   */
  | { status: 'unreadable'; persistence: 'none'; error: string }

type PersistedEncryptedSession = {
  version: 1
  format: 'electron-safe-storage-v1'
  savedAt: number
  ciphertext: string
}

type PersistedPlaintextSession = {
  version: 1
  format: 'dev-plaintext-v1'
  savedAt: number
  session: DorkaCloudSession
}

type CachedDorkaCloudSession = {
  session: DorkaCloudSession
  persistence: Exclude<DorkaCloudSessionPersistence, 'none'>
}

const memorySessions = new Map<string, CachedDorkaCloudSession>()
export const MAX_MEMORY_CLOUD_SESSIONS = 64

function rememberMemorySession(key: string, session: CachedDorkaCloudSession): void {
  memorySessions.delete(key)
  memorySessions.set(key, session)
  while (memorySessions.size > MAX_MEMORY_CLOUD_SESSIONS) {
    const oldest = memorySessions.keys().next()
    if (oldest.done || oldest.value === key) {
      break
    }
    memorySessions.delete(oldest.value)
  }
}

function sessionCacheKey(profileId: string, userDataPath: string): string {
  return `${userDataPath}\0${profileId}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDorkaCloudSession(value: unknown): value is DorkaCloudSession {
  if (!isObject(value) || !isObject(value.capabilities) || !isObject(value.capabilities.flags)) {
    return false
  }
  if (value.organizations !== undefined && !isDorkaCloudOrganizations(value.organizations)) {
    return false
  }
  return (
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof value.refreshToken === 'string' &&
    value.refreshToken.length > 0 &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) &&
    typeof value.capabilities.refreshedAt === 'number' &&
    Number.isFinite(value.capabilities.refreshedAt)
  )
}

function isDorkaCloudOrganizations(value: unknown): value is DorkaCloudOrgSummary[] {
  if (!Array.isArray(value)) {
    return false
  }
  return value.every((organization) => {
    if (!isObject(organization)) {
      return false
    }
    return (
      typeof organization.orgId === 'string' &&
      organization.orgId.length > 0 &&
      typeof organization.name === 'string' &&
      organization.name.length > 0 &&
      (organization.role === undefined || typeof organization.role === 'string')
    )
  })
}

export function getDorkaCloudSessionPath(profileId: string, userDataPath: string): string {
  return join(getDorkaProfileDirectory(profileId, userDataPath), 'account-session.json.enc')
}

export function saveDorkaCloudSession(
  profileId: string,
  userDataPath: string,
  session: DorkaCloudSession
): DorkaCloudSessionPersistence {
  const cacheKey = sessionCacheKey(profileId, userDataPath)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted: PersistedEncryptedSession = {
      version: 1,
      format: 'electron-safe-storage-v1',
      savedAt: Date.now(),
      ciphertext: safeStorage.encryptString(JSON.stringify(session)).toString('base64')
    }
    writeSecureJsonFile(getDorkaCloudSessionPath(profileId, userDataPath), encrypted)
    rememberMemorySession(cacheKey, { session, persistence: 'encrypted' })
    return 'encrypted'
  }

  if (allowsPlaintextDorkaCloudSession()) {
    const plaintext: PersistedPlaintextSession = {
      version: 1,
      format: 'dev-plaintext-v1',
      savedAt: Date.now(),
      session
    }
    writeSecureJsonFile(getDorkaCloudSessionPath(profileId, userDataPath), plaintext)
    rememberMemorySession(cacheKey, { session, persistence: 'dev-plaintext' })
    return 'dev-plaintext'
  }

  // Why: Dorka account refresh tokens must not silently fall back to plaintext
  // in production. Memory-only keeps cloud features usable until restart.
  rememberMemorySession(cacheKey, { session, persistence: 'memory-only' })
  return 'memory-only'
}

export function saveDorkaCloudSessionExchange(
  profileId: string,
  userDataPath: string,
  exchange: DorkaCloudSessionExchangeResponse
): DorkaCloudSessionPersistence {
  recordSuccessfulCloudSessionLogin(cloudSessionIdentity(profileId, exchange.cloud), userDataPath)
  return saveDorkaCloudSession(profileId, userDataPath, {
    accessToken: exchange.accessToken,
    refreshToken: exchange.refreshToken,
    expiresAt: exchange.expiresAt,
    organizations: exchange.organizations,
    capabilities: exchange.capabilities
  })
}

export function saveDorkaCloudSessionIfCurrent(
  profileId: string,
  userDataPath: string,
  session: DorkaCloudSession,
  snapshot: CloudSessionMutationSnapshot
): DorkaCloudSessionPersistence | null {
  // Why: the check and sync save share one main-process turn, so an async
  // refresh captured before sign-out/org-switch cannot resurrect the session.
  if (!isCloudSessionMutationCurrent(profileId, userDataPath, snapshot)) {
    return null
  }
  return saveDorkaCloudSession(profileId, userDataPath, session)
}

export function readDorkaCloudSession(
  profileId: string,
  userDataPath: string
): DorkaCloudSessionReadResult {
  const cacheKey = sessionCacheKey(profileId, userDataPath)
  const memorySession = memorySessions.get(cacheKey)
  if (memorySession) {
    memorySessions.delete(cacheKey)
    memorySessions.set(cacheKey, memorySession)
    return {
      status: 'found',
      session: memorySession.session,
      persistence: memorySession.persistence
    }
  }

  const path = getDorkaCloudSessionPath(profileId, userDataPath)
  if (!existsSync(path)) {
    return { status: 'missing', persistence: 'none' }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as
      | PersistedEncryptedSession
      | PersistedPlaintextSession
    if (parsed.version !== 1) {
      return { status: 'decrypt-failed', persistence: 'none', error: 'Unsupported session format.' }
    }
    if (parsed.format === 'electron-safe-storage-v1') {
      if (!safeStorage.isEncryptionAvailable()) {
        return {
          status: 'decrypt-failed',
          persistence: 'none',
          error: 'OS-backed encryption is unavailable.'
        }
      }
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.ciphertext, 'base64'))
      const session = JSON.parse(decrypted) as DorkaCloudSession
      if (!isDorkaCloudSession(session)) {
        return { status: 'decrypt-failed', persistence: 'none', error: 'Invalid saved session.' }
      }
      rememberMemorySession(cacheKey, { session, persistence: 'encrypted' })
      return { status: 'found', session, persistence: 'encrypted' }
    }
    if (parsed.format === 'dev-plaintext-v1' && allowsPlaintextDorkaCloudSession()) {
      if (!isDorkaCloudSession(parsed.session)) {
        return { status: 'decrypt-failed', persistence: 'none', error: 'Invalid saved session.' }
      }
      rememberMemorySession(cacheKey, { session: parsed.session, persistence: 'dev-plaintext' })
      return { status: 'found', session: parsed.session, persistence: 'dev-plaintext' }
    }
    return { status: 'decrypt-failed', persistence: 'none', error: 'Unsafe session format.' }
  } catch (error) {
    if (isUnreadableError(error)) {
      return {
        status: 'unreadable',
        persistence: 'none',
        error: 'Cannot read the saved Dorka account session: the read failed.'
      }
    }
    return {
      status: 'decrypt-failed',
      persistence: 'none',
      error: 'Could not decrypt saved Dorka account session.'
    }
  }
}

export function clearDorkaCloudSession(profileId: string, userDataPath: string): void {
  memorySessions.delete(sessionCacheKey(profileId, userDataPath))
  rmSync(getDorkaCloudSessionPath(profileId, userDataPath), { force: true })
}

export function getDorkaCloudMemorySessionCountForTests(): number {
  return memorySessions.size
}
