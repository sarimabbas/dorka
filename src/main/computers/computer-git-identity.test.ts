import { describe, expect, it, vi } from 'vitest'
import type { ManagedComputerConnection } from '../agents/managed-computer-host-projector'
import { ComputerGitIdentityManager } from './computer-git-identity'

function harness(state: 'running' | 'stopped' = 'running') {
  const inspect = vi.fn().mockResolvedValue({
    id: 'dev-box',
    name: 'dorka-computer-dev-box',
    image: 'dorka/computer:latest',
    state
  })
  const getComputerGitIdentity = vi
    .fn()
    .mockResolvedValue({ name: 'Ada Lovelace', email: 'ada@example.com' })
  const setComputerGitIdentity = vi.fn().mockImplementation(async (identity) => identity)
  const git = {
    getStatus: vi.fn(),
    getDiff: vi.fn(),
    getBranchCompare: vi.fn(),
    getBranchDiff: vi.fn(),
    isGitRepoAsync: vi.fn(),
    getComputerGitIdentity,
    setComputerGitIdentity
  }
  const connect = vi.fn(async (): Promise<ManagedComputerConnection> => ({
    connectionId: 'runtime-ssh-computer-dev-box',
    executionHostId: 'ssh:runtime-ssh-computer-dev-box',
    git
  }))
  const manager = new ComputerGitIdentityManager({
    computers: { inspect },
    host: { connect }
  })
  return { connect, getComputerGitIdentity, inspect, manager, setComputerGitIdentity }
}

describe('ComputerGitIdentityManager', () => {
  it('uses the managed Computer SSH provider without starting the Computer', async () => {
    const { connect, getComputerGitIdentity, manager } = harness()

    await expect(manager.get('dev-box')).resolves.toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com'
    })
    expect(connect).toHaveBeenCalledWith('dev-box')
    expect(getComputerGitIdentity).toHaveBeenCalledOnce()
  })

  it('requires an already-running Computer', async () => {
    const { connect, manager } = harness('stopped')

    await expect(manager.get('dev-box')).rejects.toThrow('Start this Computer')
    expect(connect).not.toHaveBeenCalled()
  })

  it('fails safely when the managed connection has no Git capability', async () => {
    const { connect, manager } = harness()
    connect.mockResolvedValueOnce({
      connectionId: 'runtime-ssh-computer-dev-box',
      executionHostId: 'ssh:runtime-ssh-computer-dev-box',
      git: undefined
    })

    await expect(manager.get('dev-box')).rejects.toThrow(
      'Could not access this Computer’s Git identity.'
    )
  })

  it('validates identity before connecting', async () => {
    const { connect, manager } = harness()

    await expect(
      manager.set('dev-box', { name: '--upload-pack=evil', email: 'ada@example.com' })
    ).rejects.toThrow('Git display name')
    await expect(
      manager.set('dev-box', { name: 'Ada\nInjected', email: 'ada@example.com' })
    ).rejects.toThrow('Git display name')
    expect(connect).not.toHaveBeenCalled()
  })

  it('redacts provider failures', async () => {
    const { manager, getComputerGitIdentity } = harness()
    getComputerGitIdentity.mockRejectedValueOnce(
      new Error('failed to open /home/ubuntu/.gitconfig with private details')
    )

    await expect(manager.get('dev-box')).rejects.toThrow(
      'Could not read this Computer’s Git identity.'
    )
    await expect(manager.get('dev-box')).resolves.toBeDefined()
  })
})
