import { describe, expect, it, vi } from 'vitest'
import { GitHandlerExecOperations } from './git-handler-exec-operations'
import type { GitHandlerOperationHost } from './git-handler-operation-context'

function operations(git: ReturnType<typeof vi.fn>): GitHandlerExecOperations {
  const host = {
    git,
    runWithGitReadCacheClear: async (run: () => Promise<unknown>) => run()
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these tests call only identity methods, which use git alone.
  return new GitHandlerExecOperations(host as unknown as GitHandlerOperationHost)
}

describe('Computer Git identity relay operations', () => {
  it('reads only the two identity keys from the persistent Computer user config', async () => {
    const git = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'Ada Lovelace\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'ada@example.com\n', stderr: '' })

    await expect(operations(git).getComputerIdentity()).resolves.toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com'
    })
    expect(git.mock.calls).toEqual([
      [
        ['config', '--file', '/home/ubuntu/.gitconfig', '--get', 'user.name'],
        '/home/ubuntu',
        undefined
      ],
      [
        ['config', '--file', '/home/ubuntu/.gitconfig', '--get', 'user.email'],
        '/home/ubuntu',
        undefined
      ]
    ])
  })

  it('writes fixed keys with argv and rejects injected values before Git', async () => {
    const git = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const handler = operations(git)

    await expect(
      handler.setComputerIdentity({ name: 'Ada Lovelace', email: 'ada@example.com' })
    ).resolves.toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' })
    expect(git.mock.calls).toEqual([
      [
        [
          'config',
          '--file',
          '/home/ubuntu/.gitconfig',
          '--replace-all',
          'user.name',
          'Ada Lovelace'
        ],
        '/home/ubuntu',
        undefined
      ],
      [
        [
          'config',
          '--file',
          '/home/ubuntu/.gitconfig',
          '--replace-all',
          'user.email',
          'ada@example.com'
        ],
        '/home/ubuntu',
        undefined
      ]
    ])

    git.mockClear()
    await expect(
      handler.setComputerIdentity({ name: '-c credential.helper=evil', email: 'ada@example.com' })
    ).rejects.toThrow('Git display name')
    expect(git).not.toHaveBeenCalled()
  })
})
