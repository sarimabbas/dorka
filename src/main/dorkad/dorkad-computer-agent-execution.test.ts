import { describe, expect, it, vi } from 'vitest'
import type { Run } from '../../shared/agent-roster'
import type { ComputerRuntimeInfo } from '../../shared/computer-runtime'
import { recoverPersistedManagedComputerRunHosts } from './dorkad-computer-agent-execution'

function run(id: string, computerId: string, status: Run['status']): Run {
  return {
    id,
    agentId: 'agent-1',
    computerId,
    status,
    prompt: 'continue',
    sourceDirectory: '/workspace/project',
    terminalSessionId: `terminal-${id}`,
    processIdentity: `process-${id}`,
    createdAt: 1,
    startedAt: 2
  }
}

function computer(id: string, state: ComputerRuntimeInfo['state']): ComputerRuntimeInfo {
  return { id, name: `dorka-${id}`, image: 'computer:latest', state }
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
    const connect = vi.fn(async (computerId: string) => ({
      id: `runtime-ssh-computer-${computerId}`,
      label: computerId,
      source: 'manual' as const,
      host: computerId,
      port: 2222,
      username: 'ubuntu'
    }))
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
