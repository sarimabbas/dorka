import {
  MAX_MANAGED_PTY_EXIT_EVIDENCE_ITEMS,
  isManagedExecutionUuid,
  isManagedPtyExitRecord,
  managedPtyExitCertificateId,
  validateManagedPtyExitCandidate,
  validateManagedPtyExitCertificate,
  validateManagedPtyExitCertificateId,
  type ManagedPtyExitCandidate,
  type ManagedPtyExitCertificateV1
} from '../../shared/managed-pty-exit-evidence'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_RESULT_BYTES = 1_048_576

export type ManagedDurableExitEvidence = {
  generation: string
  listExact(candidates: readonly ManagedPtyExitCandidate[]): Promise<ManagedPtyExitCertificateV1[]>
  acknowledgeExact(certificateId: string): Promise<void>
}

type RelayRequest = (
  method: string,
  params?: Record<string, unknown>,
  options?: { timeoutMs: number }
) => Promise<unknown>

export async function requestManagedDurableExitEvidence(
  request: RelayRequest
): Promise<ManagedDurableExitEvidence | undefined> {
  let capabilities: unknown
  try {
    capabilities = await request('pty.getCapabilities', undefined, {
      timeoutMs: REQUEST_TIMEOUT_MS
    })
  } catch {
    return undefined
  }
  if (
    !isManagedPtyExitRecord(capabilities) ||
    capabilities.durableExitEvidenceVersion !== 1 ||
    !isManagedExecutionUuid(capabilities.computerExecutionGeneration)
  ) {
    return undefined
  }
  const generation = capabilities.computerExecutionGeneration
  return {
    generation,
    async listExact(candidates) {
      validateCandidateList(candidates)
      const response = await request(
        'pty.listExitEvidenceV1',
        { computerExecutionGeneration: generation, candidates },
        { timeoutMs: REQUEST_TIMEOUT_MS }
      )
      return validateListResponse(response, generation, candidates)
    },
    async acknowledgeExact(certificateId) {
      validateManagedPtyExitCertificateId(certificateId)
      const response = await request(
        'pty.ackExitEvidenceV1',
        { computerExecutionGeneration: generation, certificateIds: [certificateId] },
        { timeoutMs: REQUEST_TIMEOUT_MS }
      )
      validateAckResponse(response, certificateId)
    }
  }
}

function validateCandidateList(
  candidates: readonly ManagedPtyExitCandidate[]
): asserts candidates is readonly ManagedPtyExitCandidate[] {
  if (!Array.isArray(candidates) || candidates.length > MAX_MANAGED_PTY_EXIT_EVIDENCE_ITEMS) {
    throw new Error('Managed PTY exit candidate list is invalid')
  }
  for (const candidate of candidates) {
    validateManagedPtyExitCandidate(candidate)
  }
}

function validateListResponse(
  value: unknown,
  generation: string,
  candidates: readonly ManagedPtyExitCandidate[]
): ManagedPtyExitCertificateV1[] {
  requireExactRecord(value, ['bytesRead', 'certificates', 'issues', 'truncated'])
  if (
    !Number.isSafeInteger(value.bytesRead) ||
    Number(value.bytesRead) < 0 ||
    Number(value.bytesRead) > MAX_RESULT_BYTES ||
    value.truncated !== false ||
    !Array.isArray(value.issues) ||
    value.issues.length !== 0 ||
    !Array.isArray(value.certificates) ||
    value.certificates.length > candidates.length ||
    value.certificates.length > MAX_MANAGED_PTY_EXIT_EVIDENCE_ITEMS
  ) {
    throw new Error('Managed PTY exit evidence response is unverifiable')
  }
  const exactCandidates = new Set(
    candidates.map((candidate) => `${candidate.relayPtyId}\0${candidate.ptyIncarnationId}`)
  )
  const certificates: ManagedPtyExitCertificateV1[] = []
  const seen = new Set<string>()
  for (const candidate of value.certificates) {
    if (!isManagedPtyExitRecord(candidate) || typeof candidate.certificateId !== 'string') {
      throw new Error('Managed PTY exit certificate is malformed')
    }
    const validation = validateManagedPtyExitCertificate(candidate, candidate.certificateId)
    if (!validation.ok) {
      throw new Error('Managed PTY exit certificate is malformed')
    }
    const certificate = validation.certificate
    const expectedId = managedPtyExitCertificateId(certificate)
    if (
      certificate.certificateId !== expectedId ||
      certificate.computerExecutionGeneration !== generation ||
      !exactCandidates.has(`${certificate.relayPtyId}\0${certificate.ptyIncarnationId}`) ||
      seen.has(certificate.certificateId)
    ) {
      throw new Error('Managed PTY exit certificate identity is unverifiable')
    }
    seen.add(certificate.certificateId)
    certificates.push(certificate)
  }
  return certificates
}

function validateAckResponse(value: unknown, certificateId: string): void {
  requireExactRecord(value, ['acknowledgements'])
  if (!Array.isArray(value.acknowledgements) || value.acknowledgements.length !== 1) {
    throw new Error('Managed PTY exit acknowledgement is malformed')
  }
  const acknowledgement = value.acknowledgements[0]
  requireExactRecord(acknowledgement, ['certificateId', 'status'])
  if (
    acknowledgement.certificateId !== certificateId ||
    (acknowledgement.status !== 'acknowledged' && acknowledgement.status !== 'already-acknowledged')
  ) {
    throw new Error('Managed PTY exit acknowledgement is unverifiable')
  }
}

function requireExactRecord(
  value: unknown,
  expectedKeys: readonly string[]
): asserts value is Record<string, unknown> {
  if (!isManagedPtyExitRecord(value)) {
    throw new Error('Managed PTY exit response must be an object')
  }
  const keys = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('Managed PTY exit response has unknown or missing fields')
  }
}
