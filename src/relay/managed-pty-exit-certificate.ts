import { createHash } from 'node:crypto'

const MAX_ID_BYTES = 4_096
const CERTIFICATE_KEYS = [
  'certificateId',
  'computerExecutionGeneration',
  'evidence',
  'exitCode',
  'observedAt',
  'ptyIncarnationId',
  'relayGeneration',
  'relayPtyId',
  'version'
].sort()

export const MAX_MANAGED_PTY_EXIT_CERTIFICATE_BYTES = 16_384

export type ManagedPtyExitCertificateV1 = {
  version: 1
  certificateId: string
  computerExecutionGeneration: string
  relayGeneration: string
  relayPtyId: string
  ptyIncarnationId: string
  exitCode: number
  observedAt: number
  evidence: 'node-pty-exit' | 'host-process-absent'
}

export type ManagedPtyExitCertificateDraftV1 = Omit<ManagedPtyExitCertificateV1, 'certificateId'>

export type ManagedPtyExitCandidate = {
  relayPtyId: string
  ptyIncarnationId: string
}

export function managedPtyExitCertificateId(
  identity: Pick<
    ManagedPtyExitCertificateDraftV1,
    'version' | 'computerExecutionGeneration' | 'relayPtyId' | 'ptyIncarnationId'
  >
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        identity.version,
        identity.computerExecutionGeneration,
        identity.relayPtyId,
        identity.ptyIncarnationId
      ])
    )
    .digest('hex')
}

export function serializeManagedPtyExitCertificate(
  certificate: ManagedPtyExitCertificateV1
): string {
  return `${JSON.stringify(certificate)}\n`
}

export function validateManagedPtyExitDraft(
  value: unknown
): asserts value is ManagedPtyExitCertificateDraftV1 {
  if (!isRecord(value)) {
    throw new Error('Managed PTY exit certificate must be an object')
  }
  const keys = Object.keys(value).sort()
  const expected = CERTIFICATE_KEYS.filter((key) => key !== 'certificateId')
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('Managed PTY exit certificate has unknown or missing fields')
  }
  if (value.version !== 1) {
    throw new Error('Unsupported managed PTY exit certificate version')
  }
  validateManagedPtyExitIdentity('computerExecutionGeneration', value.computerExecutionGeneration)
  validateManagedPtyExitIdentity('relayGeneration', value.relayGeneration)
  validateManagedPtyExitIdentity('relayPtyId', value.relayPtyId)
  validateManagedPtyExitIdentity('ptyIncarnationId', value.ptyIncarnationId)
  if (!Number.isSafeInteger(value.exitCode)) {
    throw new Error('Invalid managed PTY exit code')
  }
  if (!Number.isSafeInteger(value.observedAt) || Number(value.observedAt) < 0) {
    throw new Error('Invalid managed PTY exit observation time')
  }
  if (value.evidence !== 'node-pty-exit' && value.evidence !== 'host-process-absent') {
    throw new Error('Invalid managed PTY exit evidence kind')
  }
}

export function validateManagedPtyExitCertificate(
  value: unknown,
  expectedCertificateId: string
):
  | { ok: true; certificate: ManagedPtyExitCertificateV1 }
  | { ok: false; kind: 'corrupt' | 'unsupported' } {
  if (isRecord(value) && 'version' in value && value.version !== 1) {
    return { ok: false, kind: 'unsupported' }
  }
  if (!isRecord(value)) {
    return { ok: false, kind: 'corrupt' }
  }
  const keys = Object.keys(value).sort()
  if (
    keys.length !== CERTIFICATE_KEYS.length ||
    keys.some((key, index) => key !== CERTIFICATE_KEYS[index])
  ) {
    return { ok: false, kind: 'corrupt' }
  }
  try {
    const { certificateId, ...draft } = value
    validateManagedPtyExitCertificateId(certificateId)
    validateManagedPtyExitDraft(draft)
    if (
      certificateId !== expectedCertificateId ||
      managedPtyExitCertificateId(draft) !== certificateId
    ) {
      return { ok: false, kind: 'corrupt' }
    }
    return { ok: true, certificate: { ...draft, certificateId } }
  } catch {
    return { ok: false, kind: 'corrupt' }
  }
}

export function validateManagedPtyExitCandidate(
  value: unknown
): asserts value is ManagedPtyExitCandidate {
  if (!isRecord(value)) {
    throw new Error('Managed PTY exit candidate must be an object')
  }
  const keys = Object.keys(value).sort()
  if (keys.length !== 2 || keys[0] !== 'ptyIncarnationId' || keys[1] !== 'relayPtyId') {
    throw new Error('Managed PTY exit candidate has unknown or missing fields')
  }
  validateManagedPtyExitIdentity('relayPtyId', value.relayPtyId)
  validateManagedPtyExitIdentity('ptyIncarnationId', value.ptyIncarnationId)
}

export function validateManagedPtyExitIdentity(
  name: string,
  value: unknown
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > MAX_ID_BYTES) {
    throw new Error(`Invalid managed PTY exit ${name}`)
  }
}

export function validateManagedPtyExitCertificateId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Invalid managed PTY exit certificate ID')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
