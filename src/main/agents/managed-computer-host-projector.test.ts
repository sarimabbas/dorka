import { describe, expect, it, vi } from 'vitest'

const { getSshGitProvider } = vi.hoisted(() => ({
  getSshGitProvider: vi.fn()
}))

vi.mock('../providers/ssh-git-dispatch', () => ({ getSshGitProvider }))

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
    const connect = vi.fn(async () => {
      expect(getSshGitProvider).not.toHaveBeenCalled()
      getSshGitProvider.mockReturnValue(git)
    })
    const host = createManagedComputerHostProjector({
      computers: {
        resolveSshIdentityFile: vi.fn(async () => '/server/private/alpha/id_ed25519')
      },
      sessions: { connect }
    })

    await expect(host.connect('alpha')).resolves.toEqual({
      connectionId: 'runtime-ssh-computer-alpha',
      executionHostId: 'ssh:runtime-ssh-computer-alpha',
      git
    })
    expect(getSshGitProvider).toHaveBeenCalledWith('runtime-ssh-computer-alpha')
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ identityFile: '/server/private/alpha/id_ed25519' })
    )
  })
})
