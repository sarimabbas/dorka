import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Run, RunStatus } from '../../shared/agent-roster'
import { managedPtyExitCertificateId } from '../../shared/managed-pty-exit-evidence'
import type { ManagedComputerConnection } from '../agents/managed-computer-host-projector'
import { AgentRosterStore } from '../agents/agent-roster-store'
import type { PtyExitNotification } from '../runtime/pty-exit-notification'
import { ManagedRunPtyExitObserver } from './managed-run-pty-exit-observer'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function createRun(status: RunStatus = 'running') {
  const directory = await mkdtemp(join(tmpdir(), 'dorka-managed-run-exit-'))
  directories.push(directory)
  const roster = await AgentRosterStore.open(directory)
  const agent = await roster.createAgent({
    name: 'Builder',
    character: { color: 'blue', variant: 'owl' },
    job: 'Build',
    harnessId: 'codex',
    promptTemplate: 'Build carefully'
  })
  const run = await roster.createRun({
    agentId: agent.id,
    computerId: 'computer-1',
    computerExecutionGeneration: '10000000-0000-4000-8000-000000000001',
    prompt: 'Build carefully',
    terminalSessionId: 'terminal-live',
    processIdentity: 'process-live'
  })
  await roster.transitionRun(run.id, { status: 'running' })
  if (status !== 'running') {
    await roster.transitionRun(run.id, { status })
  }
  return { agentId: agent.id, roster, runId: run.id }
}

function exitRuntime() {
  const listeners: ((event: PtyExitNotification) => void)[] = []
  const unsubscribes: ReturnType<typeof vi.fn>[] = []
  return {
    listeners,
    runtime: {
      subscribeToPtyExit: vi.fn(
        (_ptyId: string, listener: (event: PtyExitNotification) => void) => {
          listeners.push(listener)
          const unsubscribe = vi.fn()
          unsubscribes.push(unsubscribe)
          return unsubscribe
        }
      )
    },
    unsubscribes
  }
}

const COMPUTER_GENERATION = '10000000-0000-4000-8000-000000000001'
const RELAY_GENERATION = '20000000-0000-4000-8000-000000000002'
const INCARNATION = '30000000-0000-4000-8000-000000000003'
const CONNECTION_ID = 'runtime-ssh-computer-computer-1'
const RELAY_PTY_ID = `pty2:${RELAY_GENERATION}:7`
const APP_PTY_ID = `ssh:${CONNECTION_ID}@@${RELAY_PTY_ID}`

function persistedRun(status: RunStatus = 'running'): Run {
  return {
    id: 'run-offline',
    agentId: 'agent-1',
    computerId: 'computer-1',
    computerExecutionGeneration: COMPUTER_GENERATION,
    status,
    prompt: 'work',
    terminalSessionId: 'terminal-offline',
    processIdentity: `${APP_PTY_ID}:${INCARNATION}`,
    createdAt: 1
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
    observedAt: 1,
    evidence: 'node-pty-exit' as const,
    ...overrides
  }
  return { ...draft, certificateId: managedPtyExitCertificateId(draft) }
}

function reconciliationFixture(status: RunStatus = 'running') {
  let current = persistedRun(status)
  const order: string[] = []
  const transitionRunningRunToWaitingIfIdentity = vi.fn(
    async (_id: string, expected: Partial<Run>) => {
      order.push('persist')
      if (
        current.status === 'running' &&
        current.computerId === expected.computerId &&
        current.computerExecutionGeneration === expected.computerExecutionGeneration &&
        current.terminalSessionId === expected.terminalSessionId &&
        current.processIdentity === expected.processIdentity
      ) {
        current = { ...current, status: 'waiting' }
      }
      return current
    }
  )
  const acknowledgeExact = vi.fn(async () => {
    order.push('ack')
  })
  const listExact = vi.fn(async () => [certificate()])
  const connection: ManagedComputerConnection = {
    connectionId: CONNECTION_ID,
    executionHostId: `ssh:${CONNECTION_ID}`,
    git: undefined,
    durableExitEvidence: {
      generation: COMPUTER_GENERATION,
      listExact,
      acknowledgeExact
    }
  }
  const runtime = {
    subscribeToPtyExit: vi.fn(() => vi.fn()),
    getExactTerminalPtyId: vi.fn<() => string | null>(() => null)
  }
  const roster = {
    getRun: vi.fn(() => current),
    transitionRunningRunToWaitingIfIdentity
  }
  const observer = new ManagedRunPtyExitObserver(roster, runtime)
  return {
    acknowledgeExact,
    connection,
    get current() {
      return current
    },
    listExact,
    observer,
    order,
    roster,
    runtime,
    setCurrent(run: Run) {
      current = run
    }
  }
}

describe('managed Run PTY exit observation', () => {
  it('projects a certified live pty.shutdown death to neutral waiting', async () => {
    const { roster, runId } = await createRun()
    const h = exitRuntime()
    const observer = new ManagedRunPtyExitObserver(roster, h.runtime)

    observer.observe(runId, 'pty-exact')
    h.listeners[0]?.({ processDeathCertified: true })

    await vi.waitFor(() => expect(roster.getRun(runId)?.status).toBe('waiting'))
    expect(h.runtime.subscribeToPtyExit).toHaveBeenCalledWith('pty-exact', expect.any(Function))
  })

  it('accepts certified exit evidence delivered synchronously while re-arming', async () => {
    const { roster, runId } = await createRun()
    const runtime = {
      subscribeToPtyExit: vi.fn(
        (_ptyId: string, listener: (event: PtyExitNotification) => void) => {
          listener({ processDeathCertified: true })
          return vi.fn()
        }
      )
    }
    const observer = new ManagedRunPtyExitObserver(roster, runtime)

    observer.observe(runId, 'pty-exact')

    await vi.waitFor(() => expect(roster.getRun(runId)?.status).toBe('waiting'))
  })

  it('keeps an unverifiable exit running and waits for later host evidence', async () => {
    const { roster, runId } = await createRun()
    const h = exitRuntime()
    const observer = new ManagedRunPtyExitObserver(roster, h.runtime)

    observer.observe(runId, 'pty-exact')
    h.listeners[0]?.({ processDeathCertified: false })

    expect(roster.getRun(runId)?.status).toBe('running')
    expect(h.runtime.subscribeToPtyExit).toHaveBeenCalledTimes(2)
  })

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    'does not change a %s Run',
    async (status) => {
      const { roster, runId } = await createRun(status)
      const h = exitRuntime()
      const observer = new ManagedRunPtyExitObserver(roster, h.runtime)

      observer.observe(runId, 'pty-exact')
      h.listeners[0]?.({ processDeathCertified: true })

      await vi.waitFor(() => expect(roster.getRun(runId)?.status).toBe(status))
    }
  )

  it('re-arms an exact live managed PTY without reading offline evidence', async () => {
    const h = reconciliationFixture()
    h.runtime.getExactTerminalPtyId.mockReturnValueOnce(APP_PTY_ID)

    await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)

    expect(h.runtime.subscribeToPtyExit).toHaveBeenCalledWith(APP_PTY_ID, expect.any(Function))
    expect(h.listExact).not.toHaveBeenCalled()
  })

  it('projects an offline certified exit before acknowledging it', async () => {
    const h = reconciliationFixture()

    await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)

    expect(h.current.status).toBe('waiting')
    expect(h.order).toEqual(['persist', 'ack'])
    expect(h.listExact).toHaveBeenCalledWith([
      { relayPtyId: RELAY_PTY_ID, ptyIncarnationId: INCARNATION, relayGeneration: RELAY_GENERATION }
    ])
  })

  it('does not acknowledge when Run persistence fails', async () => {
    const h = reconciliationFixture()
    h.roster.transitionRunningRunToWaitingIfIdentity.mockRejectedValueOnce(new Error('disk full'))

    await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)

    expect(h.acknowledgeExact).not.toHaveBeenCalled()
  })

  it('does not acknowledge after a post-rename directory sync failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dorka-managed-run-exit-'))
    directories.push(directory)
    let failSync = false
    const roster = await AgentRosterStore.open(directory, {
      syncDirectory: async () => {
        if (failSync) {
          throw new Error('directory fsync failed')
        }
      }
    })
    const agent = await roster.createAgent({
      name: 'Builder',
      character: { color: 'blue', variant: 'owl' },
      job: 'Build',
      harnessId: 'codex',
      promptTemplate: 'Build carefully'
    })
    const run = await roster.createRun({
      agentId: agent.id,
      computerId: 'computer-1',
      computerExecutionGeneration: COMPUTER_GENERATION,
      prompt: 'work',
      terminalSessionId: 'terminal-offline',
      processIdentity: `${APP_PTY_ID}:${INCARNATION}`
    })
    await roster.transitionRun(run.id, { status: 'running' })
    const acknowledgeExact = vi.fn(async () => undefined)
    const connection: ManagedComputerConnection = {
      connectionId: CONNECTION_ID,
      executionHostId: `ssh:${CONNECTION_ID}`,
      git: undefined,
      durableExitEvidence: {
        generation: COMPUTER_GENERATION,
        listExact: async () => [certificate()],
        acknowledgeExact
      }
    }
    const runtime = {
      subscribeToPtyExit: vi.fn(() => vi.fn()),
      getExactTerminalPtyId: vi.fn(() => null)
    }
    const observer = new ManagedRunPtyExitObserver(roster, runtime)
    failSync = true

    await observer.reconcileAfterConnect(connection, [roster.getRun(run.id) ?? run], runtime)

    expect(roster.getRun(run.id)?.status).toBe('running')
    expect(acknowledgeExact).not.toHaveBeenCalled()
  })

  it('replays harmlessly when acknowledgement fails', async () => {
    const h = reconciliationFixture()
    h.acknowledgeExact.mockRejectedValueOnce(new Error('relay lost'))

    await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)
    await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)

    expect(h.current.status).toBe('waiting')
    expect(h.acknowledgeExact).toHaveBeenCalledTimes(2)
  })

  it('keeps mismatched identities and unsupported relays unverifiable', async () => {
    const wrongGeneration = reconciliationFixture()
    wrongGeneration.connection.durableExitEvidence = {
      generation: '40000000-0000-4000-8000-000000000004',
      listExact: wrongGeneration.listExact,
      acknowledgeExact: wrongGeneration.acknowledgeExact
    }
    await wrongGeneration.observer.reconcileAfterConnect(
      wrongGeneration.connection,
      [wrongGeneration.current],
      wrongGeneration.runtime
    )
    expect(wrongGeneration.listExact).not.toHaveBeenCalled()

    for (const processIdentity of [
      `${APP_PTY_ID}:not-a-uuid`,
      `${APP_PTY_ID.replace(CONNECTION_ID, 'runtime-ssh-computer-other')}:${INCARNATION}`,
      `${APP_PTY_ID.replace(RELAY_GENERATION, 'wrong-generation')}:${INCARNATION}`
    ]) {
      const h = reconciliationFixture()
      h.setCurrent({ ...h.current, processIdentity })
      await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)
      expect(h.listExact).not.toHaveBeenCalled()
    }

    const oldRelay = reconciliationFixture()
    delete oldRelay.connection.durableExitEvidence
    await oldRelay.observer.reconcileAfterConnect(
      oldRelay.connection,
      [oldRelay.current],
      oldRelay.runtime
    )
    expect(oldRelay.current.status).toBe('running')
  })

  it('rejects a certificate from the wrong relay generation', async () => {
    const h = reconciliationFixture()
    h.listExact.mockResolvedValueOnce([
      certificate({ relayGeneration: '40000000-0000-4000-8000-000000000004' })
    ])

    await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)

    expect(h.current.status).toBe('running')
    expect(h.acknowledgeExact).not.toHaveBeenCalled()
  })

  it('acknowledges an exact terminal duplicate without changing its state', async () => {
    const h = reconciliationFixture('succeeded')

    await h.observer.reconcileAfterConnect(h.connection, [h.current], h.runtime)

    expect(h.current.status).toBe('succeeded')
    expect(h.roster.transitionRunningRunToWaitingIfIdentity).not.toHaveBeenCalled()
    expect(h.acknowledgeExact).toHaveBeenCalledOnce()
  })

  it('does not mutate or acknowledge when a running Run identity changes after listing', async () => {
    const h = reconciliationFixture()
    const original = h.current
    h.listExact.mockImplementationOnce(async () => {
      h.setCurrent({
        ...original,
        processIdentity: `${APP_PTY_ID}:40000000-0000-4000-8000-000000000004`
      })
      return [certificate()]
    })

    await h.observer.reconcileAfterConnect(h.connection, [original], h.runtime)

    expect(h.current.status).toBe('running')
    expect(h.acknowledgeExact).not.toHaveBeenCalled()
  })

  it('does nothing for empty evidence and after disposal', async () => {
    const empty = reconciliationFixture()
    empty.listExact.mockResolvedValueOnce([])
    await empty.observer.reconcileAfterConnect(empty.connection, [empty.current], empty.runtime)
    expect(empty.current.status).toBe('running')

    const disposed = reconciliationFixture()
    disposed.observer.dispose()
    await disposed.observer.reconcileAfterConnect(
      disposed.connection,
      [disposed.current],
      disposed.runtime
    )
    expect(disposed.listExact).not.toHaveBeenCalled()
  })

  it('unsubscribes every observed PTY on disposal', async () => {
    const first = await createRun()
    const second = await first.roster.createRun({
      agentId: first.agentId,
      computerId: 'computer-1',
      computerExecutionGeneration: COMPUTER_GENERATION,
      prompt: 'Second',
      terminalSessionId: 'terminal-second',
      processIdentity: 'process-second'
    })
    await first.roster.transitionRun(second.id, { status: 'running' })
    const h = exitRuntime()
    const observer = new ManagedRunPtyExitObserver(first.roster, h.runtime)

    observer.observe(first.runId, 'pty-1')
    observer.observe(second.id, 'pty-2')
    observer.dispose()

    expect(h.unsubscribes).toHaveLength(2)
    expect(h.unsubscribes.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true)
  })
})
