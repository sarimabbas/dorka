import './mock-descendant-sweep'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPtySpawn, mockPtyInstance, mockCreateShellPromptReadinessProbe } = vi.hoisted(() => ({
  mockPtySpawn: vi.fn(),
  mockCreateShellPromptReadinessProbe: vi.fn(),
  mockPtyInstance: {
    pid: process.pid,
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn()
  }
}))

vi.mock('node-pty', () => ({ spawn: mockPtySpawn }))
vi.mock('../main/pty/posix-pty-process-groups', () => ({
  forceKillPosixPtyProcessGroups: vi.fn((_pid: number, fallback: () => void) => fallback())
}))
vi.mock('../main/shell-prompt-readiness-probe', () => ({
  createShellPromptReadinessProbe: mockCreateShellPromptReadinessProbe
}))

import type { PtyHandler } from './pty-handler'
import * as ptyShellUtils from './pty-shell-utils'
import { ManagedPtyExitJournal } from './managed-pty-exit-journal'
import {
  beginPtyHandlerTest,
  createMockDispatcher,
  createTestPtyHandler,
  endPtyHandlerTest,
  testPtyId,
  type MockDispatcher
} from './pty-handler-test-harness'

const COMPUTER_GENERATION = '11111111-1111-4111-8111-111111111111'
const OTHER_GENERATION = '22222222-2222-4222-8222-222222222222'
const PTY_ID = testPtyId(1)

describe.skipIf(process.platform === 'win32')('PtyHandler durable exit evidence', () => {
  let root: string
  let journal: ManagedPtyExitJournal
  let dispatcher: MockDispatcher
  let handler: PtyHandler
  let originalPlatform: PropertyDescriptor | undefined

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dorka-pty-handler-exit-evidence-'))
    journal = new ManagedPtyExitJournal(root)
    ;({ dispatcher, handler, originalPlatform } = beginPtyHandlerTest({
      mockPtySpawn,
      mockPtyInstance,
      mockCreateShellPromptReadinessProbe,
      durableExitEvidence: {
        journal,
        computerExecutionGeneration: COMPUTER_GENERATION
      }
    }))
  })

  afterEach(async () => {
    await endPtyHandlerTest(handler, originalPlatform)
    rmSync(root, { recursive: true, force: true })
  })

  async function spawnWithExit(pid = process.pid): Promise<{
    incarnationId: string
    exit: (event: { exitCode: number }) => void
  }> {
    let exit: ((event: { exitCode: number }) => void) | undefined
    mockPtySpawn.mockReturnValue({
      ...mockPtyInstance,
      pid,
      onData: vi.fn(),
      onExit: vi.fn((callback: (event: { exitCode: number }) => void) => {
        exit = callback
      })
    })
    const result = await dispatcher.callRequest('pty.spawn', {})
    if (
      !exit ||
      typeof result !== 'object' ||
      result === null ||
      !('incarnationId' in result) ||
      typeof result.incarnationId !== 'string'
    ) {
      throw new Error('Test PTY did not expose its exit identity')
    }
    return { incarnationId: result.incarnationId, exit }
  }

  it('advertises and registers the additive protocol only when configured', async () => {
    await expect(dispatcher.callRequest('pty.getCapabilities')).resolves.toMatchObject({
      durableExitEvidenceVersion: 1
    })
    expect(dispatcher._requestHandlers.has('pty.listExitEvidenceV1')).toBe(true)
    expect(dispatcher._requestHandlers.has('pty.ackExitEvidenceV1')).toBe(true)

    const legacyDispatcher = createMockDispatcher()
    const legacyHandler = createTestPtyHandler(legacyDispatcher)
    await expect(legacyDispatcher.callRequest('pty.getCapabilities')).resolves.not.toHaveProperty(
      'durableExitEvidenceVersion'
    )
    expect(legacyDispatcher._requestHandlers.has('pty.listExitEvidenceV1')).toBe(false)
    await legacyHandler.dispose({ waitForPhysicalExit: false })
  })

  it('records the physical node-pty exit before removing the record without changing pty.exit', async () => {
    const durableRecord = journal.record.bind(journal)
    vi.spyOn(journal, 'record').mockImplementation((draft) => {
      expect(handler.activePtyCount).toBe(1)
      return durableRecord(draft)
    })
    const spawned = await spawnWithExit()
    spawned.exit({ exitCode: 7 })

    expect(handler.activePtyCount).toBe(0)
    const listed = await dispatcher.callRequest('pty.listExitEvidenceV1', {
      computerExecutionGeneration: COMPUTER_GENERATION,
      candidates: [{ relayPtyId: PTY_ID, ptyIncarnationId: spawned.incarnationId }]
    })
    expect(listed).toMatchObject({
      certificates: [
        {
          computerExecutionGeneration: COMPUTER_GENERATION,
          relayGeneration: 'test-mint-epoch',
          relayPtyId: PTY_ID,
          ptyIncarnationId: spawned.incarnationId,
          exitCode: 7,
          evidence: 'node-pty-exit'
        }
      ]
    })
    expect(dispatcher._notifications).toContainEqual({
      method: 'pty.exit',
      params: { id: PTY_ID, code: 7, incarnationId: spawned.incarnationId }
    })
  })

  it('records only an exact host-proven process absence on the reap path', async () => {
    const spawned = await spawnWithExit(424_242)
    vi.spyOn(ptyShellUtils, 'isProcessAlive').mockReturnValue(false)

    dispatcher.callNotification('pty.resize', { id: PTY_ID, cols: 80, rows: 24 })

    expect(
      journal.listExact(COMPUTER_GENERATION, [
        { relayPtyId: PTY_ID, ptyIncarnationId: spawned.incarnationId }
      ]).certificates
    ).toMatchObject([{ exitCode: -1, evidence: 'host-process-absent' }])
  })

  it('does not write for misses, empty inventory, grace cleanup, or relay shutdown', async () => {
    const record = vi.spyOn(journal, 'record')
    await expect(
      dispatcher.callRequest('pty.attach', { id: 'missing', expectedIncarnationId: 'inc' })
    ).rejects.toThrow('not found')
    await dispatcher.callRequest('pty.shutdown', { id: 'missing', immediate: true })
    await dispatcher.callRequest('pty.listProcesses', {})

    const spawned = await spawnWithExit()
    let cleanup: Promise<void> | undefined
    handler.startGraceTimer(() => {
      cleanup = handler.dispose()
    }, 1)
    await vi.advanceTimersByTimeAsync(1)
    spawned.exit({ exitCode: 137 })
    await cleanup

    expect(record).not.toHaveBeenCalled()
  })

  it('keeps online exit publication working when the durable write fails', async () => {
    const spawned = await spawnWithExit()
    vi.spyOn(journal, 'record').mockImplementation(() => {
      throw new Error('disk unavailable')
    })
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    spawned.exit({ exitCode: 9 })

    expect(dispatcher._notifications).toContainEqual({
      method: 'pty.exit',
      params: { id: PTY_ID, code: 9, incarnationId: spawned.incarnationId }
    })
    expect(String(stderr.mock.calls[0]?.[0])).toContain('disk unavailable')
  })

  it('lists exact candidates, treats generation mismatch as non-evidence, and acknowledges exactly', async () => {
    const spawned = await spawnWithExit()
    spawned.exit({ exitCode: 0 })
    const certificate = journal.listExact(COMPUTER_GENERATION, [
      { relayPtyId: PTY_ID, ptyIncarnationId: spawned.incarnationId }
    ]).certificates[0]
    expect(certificate).toBeDefined()

    await expect(
      dispatcher.callRequest('pty.listExitEvidenceV1', {
        computerExecutionGeneration: COMPUTER_GENERATION,
        candidates: [{ relayPtyId: PTY_ID, ptyIncarnationId: 'wrong' }]
      })
    ).resolves.toMatchObject({ certificates: [] })
    await expect(
      dispatcher.callRequest('pty.listExitEvidenceV1', {
        computerExecutionGeneration: OTHER_GENERATION,
        candidates: [{ relayPtyId: PTY_ID, ptyIncarnationId: spawned.incarnationId }]
      })
    ).resolves.toMatchObject({ certificates: [] })
    await expect(
      dispatcher.callRequest('pty.ackExitEvidenceV1', {
        computerExecutionGeneration: OTHER_GENERATION,
        certificateIds: [certificate?.certificateId]
      })
    ).rejects.toThrow('non-authoritative')

    await expect(
      dispatcher.callRequest('pty.ackExitEvidenceV1', {
        computerExecutionGeneration: COMPUTER_GENERATION,
        certificateIds: [certificate?.certificateId]
      })
    ).resolves.toMatchObject({
      acknowledgements: [{ certificateId: certificate?.certificateId, status: 'acknowledged' }]
    })
    expect(
      journal.listExact(COMPUTER_GENERATION, [
        { relayPtyId: PTY_ID, ptyIncarnationId: spawned.incarnationId }
      ]).certificates
    ).toEqual([])
  })

  it('strictly rejects malformed and unbounded list and acknowledgement requests', async () => {
    await expect(
      dispatcher.callRequest('pty.listExitEvidenceV1', {
        computerExecutionGeneration: COMPUTER_GENERATION,
        candidates: [],
        extra: true
      })
    ).rejects.toThrow('unknown or missing fields')
    await expect(
      dispatcher.callRequest('pty.listExitEvidenceV1', {
        computerExecutionGeneration: COMPUTER_GENERATION,
        candidates: Array.from({ length: 129 }, (_, index) => ({
          relayPtyId: `pty-${index}`,
          ptyIncarnationId: `inc-${index}`
        }))
      })
    ).rejects.toThrow('must not exceed 128')
    await expect(
      dispatcher.callRequest('pty.ackExitEvidenceV1', {
        computerExecutionGeneration: COMPUTER_GENERATION,
        certificateIds: ['not-a-certificate-id']
      })
    ).rejects.toThrow('Invalid managed PTY exit certificate ID')
    await expect(
      dispatcher.callRequest('pty.ackExitEvidenceV1', {
        computerExecutionGeneration: COMPUTER_GENERATION,
        certificateIds: Array.from({ length: 129 }, () => 'a'.repeat(64))
      })
    ).rejects.toThrow('must not exceed 128')
  })
})
