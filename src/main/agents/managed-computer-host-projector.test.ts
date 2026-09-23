import { describe, expect, it, vi } from 'vitest'

const { filesystem, getSshGitProvider, requireSshFilesystemProvider } = vi.hoisted(() => ({
  filesystem: {},
  getSshGitProvider: vi.fn(),
  requireSshFilesystemProvider: vi.fn()
}))

vi.mock('../providers/ssh-git-dispatch', () => ({ getSshGitProvider }))
vi.mock('../providers/ssh-filesystem-dispatch', () => ({ requireSshFilesystemProvider }))

import { createManagedComputerHostProjector } from './managed-computer-host-projector'

describe('ManagedComputerHostProjector', () => {
  it('hides target credentials and captures the Git capability registered during connection', async () => {
    const git = {
      getStatus: vi.fn(),
      getDiff: vi.fn(),
      getBranchCompare: vi.fn(),
      getBranchDiff: vi.fn(),
      isGitRepoAsync: vi.fn(),
      getComputerGitIdentity: vi.fn(),
      setComputerGitIdentity: vi.fn()
    }
    const durableExitEvidence = {
      generation: '10000000-0000-4000-8000-000000000001',
      listExact: vi.fn(async () => []),
      acknowledgeExact: vi.fn(async () => undefined)
    }
    const connect = vi.fn(async () => {
      expect(getSshGitProvider).not.toHaveBeenCalled()
      getSshGitProvider.mockReturnValue(git)
      return { durableExitEvidence }
    })
    requireSshFilesystemProvider.mockReturnValue(filesystem)
    const host = createManagedComputerHostProjector({
      computers: {
        resolveSshIdentityFile: vi.fn(async () => '/server/private/alpha/id_ed25519')
      },
      sessions: { connect }
    })

    await expect(host.connect('alpha')).resolves.toEqual({
      connectionId: 'runtime-ssh-computer-alpha',
      executionHostId: 'ssh:runtime-ssh-computer-alpha',
      filesystem,
      git,
      durableExitEvidence
    })
    expect(getSshGitProvider).toHaveBeenCalledWith('runtime-ssh-computer-alpha')
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ identityFile: '/server/private/alpha/id_ed25519' })
    )
  })
})
