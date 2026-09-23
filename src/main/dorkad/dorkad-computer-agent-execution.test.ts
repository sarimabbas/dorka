import { describe, expect, it, vi } from 'vitest'
import type { Run } from '../../shared/agent-roster'
import type { ComputerRuntimeInfo } from '../../shared/computer-runtime'
import type { ManagedComputerConnection } from '../agents/managed-computer-host-projector'
import {
  reconcileReconnectedManagedComputerRuns,
  recoverPersistedManagedComputerRunHosts
} from './dorkad-computer-agent-execution'

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

function connection(computerId: string): ManagedComputerConnection {
  return {
    connectionId: `runtime-ssh-computer-${computerId}`,
    executionHostId: `ssh:runtime-ssh-computer-${computerId}`,
    filesystem: {} as never,
    git: undefined
  }
}

describe('managed Computer reconnect recovery', () => {
  it('reconciles active persisted Runs once without starting or reconnecting the Computer', async () => {
    const runs = [
      run('run-1', 'computer-1', 'running'),
      run('run-2', 'computer-1', 'waiting'),
      run('run-3', 'computer-1', 'succeeded'),
      run('run-4', 'computer-2', 'running')
    ]
    const reconcileAfterConnect = vi.fn(async () => undefined)
    const runtime = { getExactTerminalPtyId: vi.fn(() => null) }

    await reconcileReconnectedManagedComputerRuns({
      agents: { listRuns: () => runs },
      connection: {},
      connectionId: 'runtime-ssh-computer-computer-1',
      runExitObserver: { reconcileAfterConnect },
      runtime
    })

    expect(reconcileAfterConnect).toHaveBeenCalledWith(
      { connectionId: 'runtime-ssh-computer-computer-1' },
      runs.slice(0, 3),
      runtime
    )
  })

  it('skips reconnect reconciliation when the Computer has no active Run', async () => {
    const reconcileAfterConnect = vi.fn(async () => undefined)
    await reconcileReconnectedManagedComputerRuns({
      agents: { listRuns: () => [run('run-1', 'computer-1', 'succeeded')] },
      connection: {},
      connectionId: 'runtime-ssh-computer-computer-1',
      runExitObserver: { reconcileAfterConnect },
      runtime: { getExactTerminalPtyId: vi.fn(() => null) }
    })
    expect(reconcileAfterConnect).not.toHaveBeenCalled()
  })
})

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
    const connect = vi.fn(async (computerId: string) => connection(computerId))
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

  it('delegates one post-connect reconciliation with every Run on an active Computer', async () => {
    const runs = [
      run('run-1', 'computer-1', 'running'),
      run('run-2', 'computer-1', 'waiting'),
      run('run-3', 'computer-1', 'succeeded')
    ]
    const connected = connection('computer-1')
    const connect = vi.fn(async () => connected)
    const reconcileAfterConnect = vi.fn(async () => undefined)
    const runtime = { getExactTerminalPtyId: vi.fn(() => null) }

    await recoverPersistedManagedComputerRunHosts({
      agents: { listRuns: () => runs },
      computers: { list: async () => [computer('computer-1', 'running')] },
      host: { connect },
      runExitObserver: { reconcileAfterConnect },
      runtime
    })

    expect(connect).toHaveBeenCalledOnce()
    expect(reconcileAfterConnect).toHaveBeenCalledWith(connected, runs, runtime)
  })

  it('does not connect a Computer represented only by terminal Runs', async () => {
    const connect = vi.fn(async (computerId: string) => connection(computerId))

    await recoverPersistedManagedComputerRunHosts({
      agents: { listRuns: () => [run('run-1', 'computer-1', 'succeeded')] },
      computers: { list: async () => [computer('computer-1', 'running')] },
      host: { connect }
    })

    expect(connect).not.toHaveBeenCalled()
  })

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
