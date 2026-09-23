import { closeSync, fsyncSync, openSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import {
  MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES,
  validateManagedPtyExitCertificate,
  type ManagedPtyExitCertificateV1
} from './managed-pty-exit-certificate'

const UNSUPPORTED_DIRECTORY_FSYNC_CODES = new Set(['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'])

export function readExistingManagedPtyExitCertificate(
  path: string,
  expectedCertificateId: string
): ManagedPtyExitCertificateV1 | null {
  try {
    if (statSync(path).size > MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES) {
      throw new Error(`Managed PTY exit certificate collision: ${expectedCertificateId}`)
    }
    const validation = validateManagedPtyExitCertificate(
      JSON.parse(readFileSync(path, 'utf8')),
      expectedCertificateId
    )
    if (!validation.ok) {
      throw new Error(`Managed PTY exit certificate collision: ${expectedCertificateId}`)
    }
    return validation.certificate
  } catch (error) {
    if (isMissing(error)) {
      return null
    }
    throw error
  }
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
  if (process.platform === 'win32') {
    return
  }
  const descriptor = openSync(path, 'r')
  try {
    fsyncSync(descriptor)
  } catch (error) {
    const code = errorCode(error)
    if (typeof code !== 'string' || !UNSUPPORTED_DIRECTORY_FSYNC_CODES.has(code)) {
      throw error
    }
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
