import { describe, expect, it } from 'vitest'
import type { Run } from '../../shared/agent-roster'
import {
  managedPtyExitCertificateId,
  validateManagedPtyExitCandidate
} from '../../shared/managed-pty-exit-evidence'
import {
  captureRunExecutionIdentity,
  certificateMatchesManagedRun,
  managedRunExitCandidate,
  managedRunExitCandidateKey,
  parseManagedRunExecutionIdentity,
  runHasExecutionIdentity
} from './managed-run-execution-identity'

const COMPUTER_GENERATION = '10000000-0000-4000-8000-000000000001'
const RELAY_GENERATION = '20000000-0000-4000-8000-000000000002'
const INCARNATION = '30000000-0000-4000-8000-000000000003'
const CONNECTION_ID = 'runtime-ssh-computer-main'
const RELAY_PTY_ID = `pty2:${RELAY_GENERATION}:7`
const PROCESS_IDENTITY = `ssh:${CONNECTION_ID}@@${RELAY_PTY_ID}:${INCARNATION}`

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    agentId: 'agent-1',
    computerId: 'main',
    computerExecutionGeneration: COMPUTER_GENERATION,
    status: 'running',
    prompt: 'Work',
    terminalSessionId: 'terminal-1',
    processIdentity: PROCESS_IDENTITY,
    createdAt: 1,
    ...overrides
  }
}

function certificate(overrides: Record<string, unknown> = {}) {
  const draft = {
    version: 1 as const,
    computerExecutionGeneration: COMPUTER_GENERATION,
    relayGeneration: RELAY_GENERATION,
    relayPtyId: RELAY_PTY_ID,
    ptyIncarnationId: INCARNATION,
    exitCode: 0,
    observedAt: 2,
    evidence: 'node-pty-exit' as const,
    ...overrides
  }
  return { ...draft, certificateId: managedPtyExitCertificateId(draft) }
}

describe('managed Run execution identity', () => {
  it('captures the complete immutable Run execution fence', () => {
    const current = run()
    const identity = captureRunExecutionIdentity(current)

    expect(identity).toEqual({
      computerId: 'main',
      computerExecutionGeneration: COMPUTER_GENERATION,
      terminalSessionId: 'terminal-1',
      processIdentity: PROCESS_IDENTITY
    })
    expect(identity && runHasExecutionIdentity(current, identity)).toBe(true)
    expect(
      identity && runHasExecutionIdentity(run({ processIdentity: 'replacement' }), identity)
    ).toBe(false)
  })

  it('parses one exact managed relay identity and produces its evidence candidate', () => {
    const identity = parseManagedRunExecutionIdentity(run(), CONNECTION_ID)

    expect(identity).not.toBeNull()
    if (!identity) {
      return
    }
    const candidate = managedRunExitCandidate(identity)
    expect(candidate).toEqual({
      relayPtyId: RELAY_PTY_ID,
      ptyIncarnationId: INCARNATION
    })
    expect(() => validateManagedPtyExitCandidate(candidate)).not.toThrow()
    expect(managedRunExitCandidateKey(identity)).toBe(`${RELAY_PTY_ID}\0${INCARNATION}`)
    expect(certificateMatchesManagedRun(certificate(), identity, COMPUTER_GENERATION)).toBe(true)
  })

  it.each([
    ['missing terminal', { terminalSessionId: undefined }],
    ['missing Computer generation', { computerExecutionGeneration: undefined }],
    ['wrong connection', { processIdentity: PROCESS_IDENTITY.replace(CONNECTION_ID, 'other') }],
    ['malformed incarnation', { processIdentity: PROCESS_IDENTITY.replace(INCARNATION, 'bad') }],
    [
      'malformed relay generation',
      { processIdentity: PROCESS_IDENTITY.replace(RELAY_GENERATION, 'bad') }
    ]
  ] satisfies [string, Partial<Run>][])('rejects %s', (_name, overrides) => {
    expect(parseManagedRunExecutionIdentity(run(overrides), CONNECTION_ID)).toBeNull()
  })

  it('rejects certificates outside any part of the exact execution identity', () => {
    const identity = parseManagedRunExecutionIdentity(run(), CONNECTION_ID)
    expect(identity).not.toBeNull()
    if (!identity) {
      return
    }

    expect(
      certificateMatchesManagedRun(
        certificate({ computerExecutionGeneration: '40000000-0000-4000-8000-000000000004' }),
        identity,
        COMPUTER_GENERATION
      )
    ).toBe(false)
    expect(
      certificateMatchesManagedRun(certificate(), identity, '40000000-0000-4000-8000-000000000004')
    ).toBe(false)
    expect(
      certificateMatchesManagedRun(
        certificate({ relayGeneration: '40000000-0000-4000-8000-000000000004' }),
        identity,
        COMPUTER_GENERATION
      )
    ).toBe(false)
    expect(
      certificateMatchesManagedRun(
        certificate({ ptyIncarnationId: '40000000-0000-4000-8000-000000000004' }),
        identity,
        COMPUTER_GENERATION
      )
    ).toBe(false)
  })
})
