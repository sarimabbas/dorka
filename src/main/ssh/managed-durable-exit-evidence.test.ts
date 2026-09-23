import { describe, expect, it, vi } from 'vitest'
import {
  managedPtyExitCertificateId,
  serializeManagedPtyExitCertificate,
  type ManagedPtyExitCertificateDraftV1
} from '../../shared/managed-pty-exit-evidence'
import { requestManagedDurableExitEvidence } from './managed-durable-exit-evidence'

const GENERATION = '10000000-0000-4000-8000-000000000001'
const INCARNATION = '20000000-0000-4000-8000-000000000002'
const RELAY_GENERATION = '30000000-0000-4000-8000-000000000003'
const CANDIDATE = { relayPtyId: `pty2:${RELAY_GENERATION}:1`, ptyIncarnationId: INCARNATION }

function certificate(overrides: Partial<ManagedPtyExitCertificateDraftV1> = {}) {
  const draft: ManagedPtyExitCertificateDraftV1 = {
    version: 1,
    computerExecutionGeneration: GENERATION,
    relayGeneration: RELAY_GENERATION,
    relayPtyId: CANDIDATE.relayPtyId,
    ptyIncarnationId: INCARNATION,
    exitCode: 0,
    observedAt: 1,
    evidence: 'node-pty-exit',
    ...overrides
  }
  return { ...draft, certificateId: managedPtyExitCertificateId(draft) }
}

function requestFixture(listResponse: unknown = undefined, ackResponse: unknown = undefined) {
  const cert = certificate()
  const request = vi.fn(async (method: string) => {
    if (method === 'pty.getCapabilities') {
      return {
        startupIngressVersion: 1,
        durableExitEvidenceVersion: 1,
        computerExecutionGeneration: GENERATION
      }
    }
    if (method === 'pty.listExitEvidenceV1') {
      return (
        listResponse ?? {
          certificates: [cert],
          issues: [],
          bytesRead: Buffer.byteLength(serializeManagedPtyExitCertificate(cert)),
          truncated: false
        }
      )
    }
    return (
      ackResponse ?? {
        acknowledgements: [{ certificateId: cert.certificateId, status: 'acknowledged' }]
      }
    )
  })
  return { cert, request }
}

describe('managed durable exit evidence relay client', () => {
  it('exposes only generation-gated exact list and acknowledgement methods', async () => {
    const h = requestFixture()
    const capability = await requestManagedDurableExitEvidence(h.request)

    await expect(capability?.listExact([CANDIDATE])).resolves.toEqual([h.cert])
    await expect(capability?.acknowledgeExact(h.cert.certificateId)).resolves.toBeUndefined()
    expect(h.request).toHaveBeenNthCalledWith(
      2,
      'pty.listExitEvidenceV1',
      { computerExecutionGeneration: GENERATION, candidates: [CANDIDATE] },
      { timeoutMs: 5_000 }
    )
    expect(h.request).toHaveBeenNthCalledWith(
      3,
      'pty.ackExitEvidenceV1',
      { computerExecutionGeneration: GENERATION, certificateIds: [h.cert.certificateId] },
      { timeoutMs: 5_000 }
    )
  })

  it.each([
    ['old relay', {}],
    [
      'unsupported version',
      { durableExitEvidenceVersion: 2, computerExecutionGeneration: GENERATION }
    ],
    ['missing generation', { durableExitEvidenceVersion: 1 }],
    ['malformed generation', { durableExitEvidenceVersion: 1, computerExecutionGeneration: 'bad' }]
  ])('treats %s capabilities as unavailable', async (_name, response) => {
    await expect(
      requestManagedDurableExitEvidence(vi.fn(async () => response))
    ).resolves.toBeUndefined()
  })

  it.each([
    [
      'journal issue',
      { certificates: [], issues: [{ kind: 'corrupt' }], bytesRead: 1, truncated: false }
    ],
    ['truncation', { certificates: [], issues: [], bytesRead: 1, truncated: true }],
    [
      'unknown field',
      { certificates: [], issues: [], bytesRead: 1, truncated: false, extra: true }
    ],
    ['oversized bytes', { certificates: [], issues: [], bytesRead: 1_048_577, truncated: false }]
  ])('rejects a %s list response', async (_name, response) => {
    const h = requestFixture(response)
    const capability = await requestManagedDurableExitEvidence(h.request)

    await expect(capability?.listExact([CANDIDATE])).rejects.toThrow()
  })

  it.each([
    ['corrupt hash', { ...certificate(), certificateId: 'a'.repeat(64) }, 'malformed'],
    [
      'wrong generation',
      certificate({ computerExecutionGeneration: '40000000-0000-4000-8000-000000000004' }),
      'identity'
    ],
    [
      'wrong incarnation',
      certificate({ ptyIncarnationId: '40000000-0000-4000-8000-000000000004' }),
      'identity'
    ]
  ])('rejects a certificate with %s', async (_name, invalidCertificate, message) => {
    const h = requestFixture({
      certificates: [invalidCertificate],
      issues: [],
      bytesRead: 100,
      truncated: false
    })
    const capability = await requestManagedDurableExitEvidence(h.request)

    await expect(capability?.listExact([CANDIDATE])).rejects.toThrow(message)
  })

  it('rejects a relay byte count inconsistent with canonical certificate bytes', async () => {
    const cert = certificate()
    const h = requestFixture({
      certificates: [cert],
      issues: [],
      bytesRead: Buffer.byteLength(serializeManagedPtyExitCertificate(cert)) - 1,
      truncated: false
    })
    const capability = await requestManagedDurableExitEvidence(h.request)

    await expect(capability?.listExact([CANDIDATE])).rejects.toThrow('byte count')
  })

  it('independently enforces the aggregate canonical certificate budget', async () => {
    const candidates = Array.from({ length: 128 }, (_, index) => ({
      relayPtyId: `${String(index).padStart(4, '0')}-${'p'.repeat(4_080)}`,
      ptyIncarnationId: `${String(index).padStart(4, '0')}-${'i'.repeat(4_080)}`
    }))
    const certificates = candidates.map((candidate) =>
      certificate({
        relayGeneration: 'r'.repeat(4_096),
        relayPtyId: candidate.relayPtyId,
        ptyIncarnationId: candidate.ptyIncarnationId
      })
    )
    const h = requestFixture({
      certificates,
      issues: [],
      bytesRead: 1,
      truncated: false
    })
    const capability = await requestManagedDurableExitEvidence(h.request)

    await expect(capability?.listExact(candidates)).rejects.toThrow('byte budget')
  })

  it('bounds request arrays and strictly validates acknowledgements', async () => {
    const h = requestFixture(undefined, {
      acknowledgements: [{ certificateId: hCertificateId(), status: 'not-found' }]
    })
    const capability = await requestManagedDurableExitEvidence(h.request)

    await expect(
      capability?.listExact(
        Array.from({ length: 129 }, (_, index) => ({
          relayPtyId: `pty-${index}`,
          ptyIncarnationId: INCARNATION
        }))
      )
    ).rejects.toThrow('candidate list')
    await expect(capability?.acknowledgeExact(h.cert.certificateId)).rejects.toThrow('unverifiable')
  })
})

function hCertificateId(): string {
  return certificate().certificateId
}
