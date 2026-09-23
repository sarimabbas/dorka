import { describe, expect, it, vi } from 'vitest'
import type { Run } from '../../shared/agent-roster'
import type { ComputerRuntimeInfo } from '../../shared/computer-runtime'
import { recoverPersistedManagedComputerRunHosts } from './dorkad-computer-agent-execution'

function ptyId(id: string, computerId: string): string {
  return `ssh:runtime-ssh-computer-${computerId}@@pty2:${id}:2`
}

function run(id: string, computerId: string, status: Run['status']): Run {
  return {
    id,
    agentId: 'agent-1',
    computerId,
    status,
    prompt: 'continue',
    sourceDirectory: '/workspace/project',
    terminalSessionId: `terminal-${id}`,
    processIdentity: `${ptyId(id, computerId)}:inc-${id}`,
    createdAt: 1,
    startedAt: 2
  }
}

function computer(id: string, state: ComputerRuntimeInfo['state']): ComputerRuntimeInfo {
  return { id, name: `dorka-${id}`, image: 'computer:latest', state }
}

function target(computerId: string) {
  return {
    id: `runtime-ssh-computer-${computerId}`,
    label: computerId,
    source: 'manual' as const,
    host: computerId,
    port: 2222,
    username: 'ubuntu'
  }
}

describe('persisted managed Computer Run recovery', () => {
  it('deduplicates running Computers without relaunching or changing Run records', async () => {
    const runs = [
      run('run-1', 'computer-1', 'running'),
      run('run-2', 'computer-1', 'waiting'),
      run('run-3', 'computer-stopped', 'running'),
      run('run-4', 'computer-missing', 'waiting'),
      run('run-5', 'computer-2', 'succeeded')
    ]
    const before = structuredClone(runs)
    const connect = vi.fn(async (computerId: string) => target(computerId))
    const start = vi.fn()
    const computers = {
      list: async () => [
        computer('computer-1', 'running'),
        computer('computer-stopped', 'stopped'),
        computer('computer-2', 'running')
      ],
      start
    }

    await expect(
      recoverPersistedManagedComputerRunHosts({
        agents: { listRuns: () => runs },
        computers,
        host: { connect }
      })
    ).resolves.toEqual({
      recoveredComputerIds: ['computer-1'],
      failedComputerIds: []
    })

    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith('computer-1')
    expect(start).not.toHaveBeenCalled()
    expect(runs).toEqual(before)
  })

  it('re-arms every exact Run with realistic colon-bearing relay PTY IDs', async () => {
    const runs = [run('run-1', 'computer-1', 'running'), run('run-2', 'computer-1', 'waiting')]
    const connect = vi.fn(async (computerId: string) => target(computerId))
    const observe = vi.fn()
    const getExactTerminalPtyId = vi.fn((handle: string, processIdentity: string) => {
      const candidate = runs.find(
        (run) => run.terminalSessionId === handle && run.processIdentity === processIdentity
      )
      return candidate ? ptyId(candidate.id, candidate.computerId) : null
    })

    await recoverPersistedManagedComputerRunHosts({
      agents: { listRuns: () => runs },
      computers: { list: async () => [computer('computer-1', 'running')] },
      host: { connect },
      runExitObserver: { observe },
      runtime: { getExactTerminalPtyId }
    })

    expect(connect).toHaveBeenCalledOnce()
    expect(observe.mock.calls).toEqual([
      ['run-1', 'ssh:runtime-ssh-computer-computer-1@@pty2:run-1:2'],
      ['run-2', 'ssh:runtime-ssh-computer-computer-1@@pty2:run-2:2']
    ])
  })

  it.each([
    ['missing terminal identity', { terminalSessionId: undefined }],
    ['missing process identity', { processIdentity: undefined }],
    ['malformed process identity', { processIdentity: 'not-a-pty' }],
    ['different Computer identity', { processIdentity: `${ptyId('run', 'computer-2')}:inc-run` }]
  ])('does not observe a Run with %s', async (_name, overrides) => {
    const persisted = { ...run('run', 'computer-1', 'running'), ...overrides }
    const observe = vi.fn()

    await recoverPersistedManagedComputerRunHosts({
      agents: { listRuns: () => [persisted] },
      computers: { list: async () => [computer('computer-1', 'running')] },
      host: { connect: vi.fn(async (computerId: string) => target(computerId)) },
      runExitObserver: { observe },
      runtime: {
        getExactTerminalPtyId: () =>
          persisted.processIdentity?.includes('computer-2') ? ptyId('run', 'computer-2') : null
      }
    })

    expect(observe).not.toHaveBeenCalled()
  })

  it('does not observe an absent or replaced persisted PTY', async () => {
    const observe = vi.fn()

    await recoverPersistedManagedComputerRunHosts({
      agents: { listRuns: () => [run('run-1', 'computer-1', 'running')] },
      computers: { list: async () => [computer('computer-1', 'running')] },
      host: { connect: vi.fn(async (computerId: string) => target(computerId)) },
      runExitObserver: { observe },
      runtime: { getExactTerminalPtyId: () => null }
    })

    expect(observe).not.toHaveBeenCalled()
  })

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    'does not observe a %s Run',
    async (status) => {
      const observe = vi.fn()
      await recoverPersistedManagedComputerRunHosts({
        agents: { listRuns: () => [run('run-1', 'computer-1', status)] },
        computers: { list: async () => [computer('computer-1', 'running')] },
        host: { connect: vi.fn(async (computerId: string) => target(computerId)) },
        runExitObserver: { observe },
        runtime: { getExactTerminalPtyId: vi.fn() }
      })

      expect(observe).not.toHaveBeenCalled()
    }
  )

  it('reports reconnect failures without returning private key paths', async () => {
    const privateKeyPath = '/home/operator/.ssh/dorka-computer'
    const result = await recoverPersistedManagedComputerRunHosts({
      agents: { listRuns: () => [run('run-1', 'computer-1', 'running')] },
      computers: { list: async () => [computer('computer-1', 'running')] },
      host: {
        connect: async () => {
          throw new Error(`Cannot read ${privateKeyPath}`)
        }
      }
    })

    expect(result).toEqual({
      recoveredComputerIds: [],
      failedComputerIds: ['computer-1']
    })
    expect(JSON.stringify(result)).not.toContain(privateKeyPath)
  })

  it('degrades instead of throwing when current Computers cannot be listed', async () => {
    await expect(
      recoverPersistedManagedComputerRunHosts({
        agents: { listRuns: () => [run('run-1', 'computer-1', 'running')] },
        computers: {
          list: async () => {
            throw new Error('engine unavailable')
          }
        },
        host: { connect: vi.fn() }
      })
    ).resolves.toEqual({
      recoveredComputerIds: [],
      failedComputerIds: [],
      unavailableReason: 'computer-list-failed'
    })
  })
})
