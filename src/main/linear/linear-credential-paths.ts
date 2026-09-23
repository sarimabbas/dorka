import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LEGACY_WORKSPACE_ID = 'legacy'

function getDorkaDir(): string {
  return join(homedir(), '.dorka')
}

function getLegacyTokenPath(): string {
  return join(getDorkaDir(), 'linear-token.enc')
}

export function getLegacyViewerPath(): string {
  return join(getDorkaDir(), 'linear-viewer.json')
}

export function getWorkspaceFilePath(): string {
  return join(getDorkaDir(), 'linear-workspaces.json')
}

function getWorkspaceTokenDir(): string {
  return join(getDorkaDir(), 'linear-tokens')
}

export function getWorkspaceTokenPath(workspaceId: string): string {
  if (workspaceId === LEGACY_WORKSPACE_ID) {
    return getLegacyTokenPath()
  }
  return join(getWorkspaceTokenDir(), `${Buffer.from(workspaceId).toString('base64url')}.enc`)
}

export function ensureDorkaDir(): void {
  const dir = getDorkaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function ensureWorkspaceTokenDir(): void {
  const dir = getWorkspaceTokenDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
