import { randomBytes } from 'node:crypto'
import {
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import {
  MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES,
  managedPtyExitCertificateId,
  serializeManagedPtyExitCertificate,
  validateManagedPtyExitCandidate,
  validateManagedPtyExitCertificate,
  validateManagedPtyExitCertificateId,
  validateManagedPtyExitDraft,
  validateManagedPtyExitIdentity,
  type ManagedPtyExitCandidate,
  type ManagedPtyExitCertificateDraftV1,
  type ManagedPtyExitCertificateV1
} from './managed-pty-exit-certificate'
import {
  fsyncDirectory,
  fsyncFile,
  isAlreadyExists,
  isMissing,
  readExistingManagedPtyExitCertificate,
  unlinkIfExists
} from './managed-pty-exit-journal-filesystem'

export type {
  ManagedPtyExitCandidate,
  ManagedPtyExitCertificateDraftV1,
  ManagedPtyExitCertificateV1
} from './managed-pty-exit-certificate'

const MAX_CANDIDATES = 128
const MAX_RESULT_BYTES = 1_048_576

export type ManagedPtyExitJournalIssue = {
  certificateId: string
  kind: 'corrupt' | 'oversized' | 'unreadable' | 'unsupported'
  quarantined: boolean
}

export type ManagedPtyExitListResult = {
  certificates: ManagedPtyExitCertificateV1[]
  issues: ManagedPtyExitJournalIssue[]
  bytesRead: number
  truncated: boolean
}

export class ManagedPtyExitJournal {
  private readonly pendingDirectory: string
  private readonly acknowledgedDirectory: string
  private readonly quarantineDirectory: string

  constructor(rootDirectory: string) {
    if (typeof rootDirectory !== 'string' || rootDirectory.length === 0) {
      throw new Error('Managed PTY exit journal root directory is required')
    }
    this.pendingDirectory = join(rootDirectory, 'pending')
    this.acknowledgedDirectory = join(rootDirectory, 'acknowledged')
    this.quarantineDirectory = join(rootDirectory, 'quarantine')
    mkdirSync(this.pendingDirectory, { recursive: true, mode: 0o700 })
    mkdirSync(this.acknowledgedDirectory, { recursive: true, mode: 0o700 })
    mkdirSync(this.quarantineDirectory, { recursive: true, mode: 0o700 })
  }

  record(draft: ManagedPtyExitCertificateDraftV1): ManagedPtyExitCertificateV1 {
    validateManagedPtyExitDraft(draft)
    const certificate: ManagedPtyExitCertificateV1 = {
      ...draft,
      certificateId: managedPtyExitCertificateId(draft)
    }
    const contents = serializeManagedPtyExitCertificate(certificate)
    if (Buffer.byteLength(contents) > MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES) {
      throw new Error('Managed PTY exit certificate exceeds the byte limit')
    }

    const targetPath = this.pendingPath(certificate.certificateId)
    const temporaryPath = join(
      this.pendingDirectory,
      `.${certificate.certificateId}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
    )
    try {
      writeFileSync(temporaryPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      fsyncFile(temporaryPath)
      try {
        linkSync(temporaryPath, targetPath)
      } catch (error) {
        if (!isAlreadyExists(error)) {
          throw error
        }
        const existing = readExistingManagedPtyExitCertificate(
          targetPath,
          certificate.certificateId
        )
        if (!existing || serializeManagedPtyExitCertificate(existing) !== contents) {
          throw new Error(`Managed PTY exit certificate collision: ${certificate.certificateId}`)
        }
        fsyncDirectory(this.pendingDirectory)
        return existing
      }
      unlinkSync(temporaryPath)
      fsyncDirectory(this.pendingDirectory)
      return certificate
    } finally {
      rmSync(temporaryPath, { force: true })
    }
  }

  listExact(
    computerExecutionGeneration: string,
    candidates: readonly ManagedPtyExitCandidate[]
  ): ManagedPtyExitListResult {
    validateManagedPtyExitIdentity('computerExecutionGeneration', computerExecutionGeneration)
    if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES) {
      throw new Error(`Managed PTY exit candidate count must not exceed ${MAX_CANDIDATES}`)
    }

    const certificates: ManagedPtyExitCertificateV1[] = []
    const issues: ManagedPtyExitJournalIssue[] = []
    const seen = new Set<string>()
    let bytesRead = 0
    let truncated = false

    for (const candidate of candidates) {
      validateManagedPtyExitCandidate(candidate)
      const certificateId = managedPtyExitCertificateId({
        version: 1,
        computerExecutionGeneration,
        relayPtyId: candidate.relayPtyId,
        ptyIncarnationId: candidate.ptyIncarnationId
      })
      if (seen.has(certificateId)) {
        continue
      }
      seen.add(certificateId)

      const path = this.pendingPath(certificateId)
      let size: number
      try {
        const stats = lstatSync(path)
        if (!stats.isFile()) {
          issues.push(this.quarantine(path, certificateId, 'corrupt'))
          continue
        }
        size = stats.size
      } catch (error) {
        if (isMissing(error)) {
          continue
        }
        issues.push({ certificateId, kind: 'unreadable', quarantined: false })
        continue
      }
      if (size > MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES) {
        issues.push(this.quarantine(path, certificateId, 'oversized'))
        continue
      }
      if (bytesRead + size > MAX_RESULT_BYTES) {
        truncated = true
        break
      }

      let parsed: unknown
      try {
        const contents = readFileSync(path, 'utf8')
        bytesRead += Buffer.byteLength(contents)
        parsed = JSON.parse(contents)
      } catch {
        issues.push(this.quarantine(path, certificateId, 'corrupt'))
        continue
      }

      const validation = validateManagedPtyExitCertificate(parsed, certificateId)
      if (!validation.ok) {
        issues.push(this.quarantine(path, certificateId, validation.kind))
        continue
      }
      const certificate = validation.certificate
      if (
        certificate.computerExecutionGeneration === computerExecutionGeneration &&
        certificate.relayPtyId === candidate.relayPtyId &&
        certificate.ptyIncarnationId === candidate.ptyIncarnationId
      ) {
        certificates.push(certificate)
      }
    }

    return { certificates, issues, bytesRead, truncated }
  }

  acknowledge(certificateId: string): 'acknowledged' | 'already-acknowledged' | 'not-found' {
    validateManagedPtyExitCertificateId(certificateId)
    const pendingPath = this.pendingPath(certificateId)
    const acknowledgedPath = join(this.acknowledgedDirectory, `${certificateId}.json`)
    const pending = readExistingManagedPtyExitCertificate(pendingPath, certificateId)
    const acknowledged = readExistingManagedPtyExitCertificate(acknowledgedPath, certificateId)
    if (acknowledged) {
      if (
        pending &&
        serializeManagedPtyExitCertificate(pending) !==
          serializeManagedPtyExitCertificate(acknowledged)
      ) {
        throw new Error(`Managed PTY exit certificate collision: ${certificateId}`)
      }
      if (pending) {
        fsyncDirectory(this.acknowledgedDirectory)
        unlinkIfExists(pendingPath)
        fsyncDirectory(this.pendingDirectory)
      }
      return 'already-acknowledged'
    }
    if (!pending) {
      return 'not-found'
    }

    try {
      linkSync(pendingPath, acknowledgedPath)
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error
      }
      const raced = readExistingManagedPtyExitCertificate(acknowledgedPath, certificateId)
      if (
        !raced ||
        serializeManagedPtyExitCertificate(raced) !== serializeManagedPtyExitCertificate(pending)
      ) {
        throw new Error(`Managed PTY exit certificate collision: ${certificateId}`)
      }
    }
    fsyncDirectory(this.acknowledgedDirectory)
    unlinkIfExists(pendingPath)
    fsyncDirectory(this.pendingDirectory)
    return 'acknowledged'
  }

  private pendingPath(certificateId: string): string {
    return join(this.pendingDirectory, `${certificateId}.json`)
  }

  private quarantine(
    sourcePath: string,
    certificateId: string,
    kind: ManagedPtyExitJournalIssue['kind']
  ): ManagedPtyExitJournalIssue {
    const destination = join(
      this.quarantineDirectory,
      `${certificateId}.${Date.now()}.${randomBytes(4).toString('hex')}.json`
    )
    try {
      renameSync(sourcePath, destination)
      fsyncDirectory(this.quarantineDirectory)
      fsyncDirectory(this.pendingDirectory)
      return { certificateId, kind, quarantined: true }
    } catch {
      return { certificateId, kind, quarantined: false }
    }
  }
}
