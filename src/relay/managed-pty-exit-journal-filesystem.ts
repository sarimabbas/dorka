import { closeSync, constants, fstatSync, fsyncSync, openSync, readSync, unlinkSync } from 'node:fs'
import {
  MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES,
  validateManagedPtyExitCertificate,
  type ManagedPtyExitCertificateV1
} from './managed-pty-exit-certificate'

export type BoundedRegularFileRead =
  | { kind: 'ok'; contents: string; bytesRead: number }
  | { kind: 'missing' }
  | { kind: 'not-regular' }
  | { kind: 'too-large' }

export function readBoundedRegularFile(path: string, maxBytes: number): BoundedRegularFileRead {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error('Bounded file read requires a non-negative byte limit')
  }
  let descriptor: number
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    descriptor = openSync(path, constants.O_RDONLY | noFollow)
  } catch (error) {
    if (isMissing(error)) {
      return { kind: 'missing' }
    }
    if (errorCode(error) === 'ELOOP') {
      return { kind: 'not-regular' }
    }
    throw error
  }

  try {
    const stats = fstatSync(descriptor)
    if (!stats.isFile()) {
      return { kind: 'not-regular' }
    }
    if (stats.size > maxBytes) {
      return { kind: 'too-large' }
    }
    const buffer = Buffer.alloc(maxBytes + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      const count = readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null)
      if (count === 0) {
        break
      }
      bytesRead += count
    }
    if (bytesRead > maxBytes) {
      return { kind: 'too-large' }
    }
    return { kind: 'ok', contents: buffer.toString('utf8', 0, bytesRead), bytesRead }
  } finally {
    closeSync(descriptor)
  }
}

export function readExistingManagedPtyExitCertificate(
  path: string,
  expectedCertificateId: string
): ManagedPtyExitCertificateV1 | null {
  const read = readBoundedRegularFile(path, MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES)
  if (read.kind === 'missing') {
    return null
  }
  if (read.kind !== 'ok') {
    throw new Error(`Managed PTY exit certificate collision: ${expectedCertificateId}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(read.contents)
  } catch {
    throw new Error(`Managed PTY exit certificate collision: ${expectedCertificateId}`)
  }
  const validation = validateManagedPtyExitCertificate(parsed, expectedCertificateId)
  if (!validation.ok) {
    throw new Error(`Managed PTY exit certificate collision: ${expectedCertificateId}`)
  }
  return validation.certificate
}

export function isAlreadyExists(error: unknown): boolean {
  return errorCode(error) === 'EEXIST'
}

export function isMissing(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

export function unlinkIfExists(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if (!isMissing(error)) {
      throw error
    }
  }
}

export function fsyncFile(path: string): void {
  const descriptor = openSync(path, process.platform === 'win32' ? 'r+' : 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

export function fsyncDirectory(path: string): void {
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const directoryOnly = typeof constants.O_DIRECTORY === 'number' ? constants.O_DIRECTORY : 0
  const descriptor = openSync(path, constants.O_RDONLY | noFollow | directoryOnly)
  try {
    if (!fstatSync(descriptor).isDirectory()) {
      throw new Error(`Managed PTY exit journal path is not a directory: ${path}`)
    }
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function errorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }
  return error.code
}
