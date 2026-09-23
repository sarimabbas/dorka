import {
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ManagedPtyExitJournal,
  type ManagedPtyExitCertificateDraftV1,
  type ManagedPtyExitCandidate
} from './managed-pty-exit-journal'

function draft(
  overrides: Partial<ManagedPtyExitCertificateDraftV1> = {}
): ManagedPtyExitCertificateDraftV1 {
  return {
    version: 1,
    computerExecutionGeneration: 'computer-generation-1',
    relayGeneration: 'relay-generation-1',
    relayPtyId: 'pty-1',
    ptyIncarnationId: 'incarnation-1',
    exitCode: 0,
    observedAt: 1_700_000_000_000,
    evidence: 'node-pty-exit',
    ...overrides
  }
}

function candidate(value: ManagedPtyExitCertificateDraftV1 = draft()): ManagedPtyExitCandidate {
  return {
    relayPtyId: value.relayPtyId,
    ptyIncarnationId: value.ptyIncarnationId
  }
}

describe('ManagedPtyExitJournal', () => {
  let root: string
  let journal: ManagedPtyExitJournal

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dorka-managed-pty-exit-journal-'))
    journal = new ManagedPtyExitJournal(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('ignores same-filesystem crash residue and partial unpublished writes', () => {
    writeFileSync(join(root, 'pending', '.abandoned.tmp'), '{"version":1')

    expect(journal.listExact('computer-generation-1', [candidate()])).toEqual({
      certificates: [],
      issues: [],
      bytesRead: 0,
      truncated: false
    })
    expect(existsSync(join(root, 'pending', '.abandoned.tmp'))).toBe(true)
  })

  it('records identical certificates idempotently with a deterministic ID', () => {
    const first = journal.record(draft())
    const second = journal.record(draft())

    expect(second).toEqual(first)
    expect(first.certificateId).toMatch(/^[a-f0-9]{64}$/)
    expect(readdirSync(join(root, 'pending'))).toEqual([`${first.certificateId}.json`])
  })

  it('refuses to overwrite a preexisting different certificate at the same deterministic ID', () => {
    const first = journal.record(draft())

    expect(() => journal.record(draft({ exitCode: 7 }))).toThrow(
      `Managed PTY exit certificate collision: ${first.certificateId}`
    )
    expect(
      JSON.parse(readFileSync(join(root, 'pending', `${first.certificateId}.json`), 'utf8'))
    ).toMatchObject({ exitCode: 0 })
  })

  it('quarantines corrupt and unsupported exact files without returning evidence', () => {
    const corrupt = journal.record(draft())
    const corruptPath = join(root, 'pending', `${corrupt.certificateId}.json`)
    writeFileSync(corruptPath, '{"version":1')

    const corruptResult = journal.listExact('computer-generation-1', [candidate()])
    expect(corruptResult.certificates).toEqual([])
    expect(corruptResult.issues).toEqual([
      { certificateId: corrupt.certificateId, kind: 'corrupt', quarantined: true }
    ])

    const unsupportedDraft = draft({ relayPtyId: 'pty-unsupported' })
    const unsupported = journal.record(unsupportedDraft)
    writeFileSync(
      join(root, 'pending', `${unsupported.certificateId}.json`),
      JSON.stringify({ ...unsupported, version: 2 })
    )
    const unsupportedResult = journal.listExact('computer-generation-1', [
      candidate(unsupportedDraft)
    ])
    expect(unsupportedResult.certificates).toEqual([])
    expect(unsupportedResult.issues).toEqual([
      { certificateId: unsupported.certificateId, kind: 'unsupported', quarantined: true }
    ])
    expect(readdirSync(join(root, 'quarantine'))).toHaveLength(2)
  })

  it('returns only exact generation, PTY, and incarnation matches', () => {
    const certificate = journal.record(draft())

    expect(journal.listExact('other-computer-generation', [candidate()]).certificates).toEqual([])
    expect(
      journal.listExact('computer-generation-1', [
        { relayPtyId: 'pty-1', ptyIncarnationId: 'other-incarnation' }
      ]).certificates
    ).toEqual([])
    expect(journal.listExact('computer-generation-1', [candidate()]).certificates).toEqual([
      certificate
    ])
  })

  it('enforces candidate and response byte bounds without removing pending evidence', () => {
    const tooMany = Array.from({ length: 129 }, (_, index) => ({
      relayPtyId: `pty-${index}`,
      ptyIncarnationId: `incarnation-${index}`
    }))
    expect(() => journal.listExact('computer-generation-1', tooMany)).toThrow(
      'candidate count must not exceed 128'
    )

    const generation = 'g'.repeat(4_096)
    const largeCandidates = Array.from({ length: 128 }, (_, index) => {
      const value = draft({
        computerExecutionGeneration: generation,
        relayPtyId: `${index}-${'p'.repeat(4_080)}`,
        ptyIncarnationId: `${index}-${'i'.repeat(4_080)}`
      })
      journal.record(value)
      return candidate(value)
    })
    const result = journal.listExact(generation, largeCandidates)
    expect(result.truncated).toBe(true)
    expect(result.bytesRead).toBeLessThanOrEqual(1_048_576)
    expect(result.certificates.length).toBeLessThan(largeCandidates.length)
    expect(readdirSync(join(root, 'pending'))).toHaveLength(largeCandidates.length)
  })

  it('keeps pending evidence when acknowledgement collides', () => {
    const certificate = journal.record(draft())
    const acknowledgedPath = join(root, 'acknowledged', `${certificate.certificateId}.json`)
    writeFileSync(acknowledgedPath, JSON.stringify({ ...certificate, exitCode: 9 }))

    expect(() => journal.acknowledge(certificate.certificateId)).toThrow('certificate collision')
    expect(existsSync(join(root, 'pending', `${certificate.certificateId}.json`))).toBe(true)
  })

  it('persists pending evidence across journal restarts', () => {
    const certificate = journal.record(draft())
    const restarted = new ManagedPtyExitJournal(root)

    expect(restarted.listExact('computer-generation-1', [candidate()]).certificates).toEqual([
      certificate
    ])
  })

  it('atomically moves pending evidence to acknowledged and acknowledges idempotently', () => {
    const certificate = journal.record(draft())
    const pendingPath = join(root, 'pending', `${certificate.certificateId}.json`)
    const acknowledgedPath = join(root, 'acknowledged', `${certificate.certificateId}.json`)

    expect(journal.acknowledge(certificate.certificateId)).toBe('acknowledged')
    expect(existsSync(pendingPath)).toBe(false)
    expect(existsSync(acknowledgedPath)).toBe(true)
    expect(journal.acknowledge(certificate.certificateId)).toBe('already-acknowledged')
    expect(journal.listExact('computer-generation-1', [candidate()]).certificates).toEqual([])
  })

  it('converges matching pending and acknowledged crash residue', () => {
    const certificate = journal.record(draft())
    const pendingPath = join(root, 'pending', `${certificate.certificateId}.json`)
    const acknowledgedPath = join(root, 'acknowledged', `${certificate.certificateId}.json`)
    linkSync(pendingPath, acknowledgedPath)

    expect(journal.acknowledge(certificate.certificateId)).toBe('already-acknowledged')
    expect(existsSync(pendingPath)).toBe(false)
    expect(existsSync(acknowledgedPath)).toBe(true)
  })

  it('strictly rejects unknown fields and non-v1 drafts', () => {
    const unknownField = { ...draft(), extra: true }
    const unsupported = { ...draft(), version: 2 }

    expect(() => Reflect.apply(journal.record, journal, [unknownField])).toThrow(
      'unknown or missing fields'
    )
    expect(() => Reflect.apply(journal.record, journal, [unsupported])).toThrow(
      'Unsupported managed PTY exit certificate version'
    )
  })

  it('creates journal directories beneath the supplied root', () => {
    const missingRoot = join(root, 'missing-parent', 'journal')
    mkdirSync(join(root, 'missing-parent'))
    const isolated = new ManagedPtyExitJournal(missingRoot)

    expect(isolated.listExact('computer-generation-1', [])).toMatchObject({ certificates: [] })
    expect(existsSync(missingRoot)).toBe(true)
  })
})
