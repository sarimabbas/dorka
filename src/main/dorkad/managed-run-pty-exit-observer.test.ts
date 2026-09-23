import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunStatus } from '../../shared/agent-roster'
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
    prompt: 'Build carefully'
  })
  await roster.transitionRun(run.id, { status: 'running' })
  if (status !== 'running') {
    await roster.transitionRun(run.id, { status })
  }
  return { roster, runId: run.id }
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

describe('managed Run PTY exit observation', () => {
  it('moves a running Run to waiting after certified process death', async () => {
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

  it('unsubscribes every observed PTY on disposal', async () => {
    const first = await createRun()
    const second = await createRun()
    const h = exitRuntime()
    const observer = new ManagedRunPtyExitObserver(first.roster, h.runtime)

    observer.observe(first.runId, 'pty-1')
    observer.observe(second.runId, 'pty-2')
    observer.dispose()

    expect(h.unsubscribes).toHaveLength(2)
    expect(h.unsubscribes.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true)
  })
})
