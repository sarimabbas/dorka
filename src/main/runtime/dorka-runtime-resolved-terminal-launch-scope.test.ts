import { describe, expect, it, vi } from 'vitest'
import { toSshExecutionHostId } from '../../shared/execution-host'
import { DorkaRuntimeService } from './dorka-runtime'
import type { TerminalWorkspaceLaunchScope } from './runtime-legacy-worker-terminal-recovery-types'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

const REMOTE_SCOPE = {
  id: 'computer-workspace',
  path: '/workspace',
  connectionId: 'runtime-ssh-computer:computer-1',
  repo: null,
  folderWorkspace: null
} satisfies TerminalWorkspaceLaunchScope

describe('DorkaRuntimeService resolved terminal launch scope', () => {
  it('launches the incumbent agent flow on the supplied remote scope', async () => {
    const runtime = new DorkaRuntimeService()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test replaces only runtime internals needed to keep agent trust writes off the host filesystem.
    const internals = runtime as unknown as {
      store: { getSettings: () => Record<string, unknown> }
      markWorkspaceTrustedForAgent: () => Promise<void>
    }
    internals.store = { getSettings: () => ({}) }
    internals.markWorkspaceTrustedForAgent = async () => undefined
    const spawn = vi.fn().mockResolvedValue({
      id: 'remote-pty-1',
      incarnationId: 'incarnation-1'
    })
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })

    const terminal = await runtime.createTerminalInWorkspaceScope(REMOTE_SCOPE, {
      startupAgent: 'codex',
      startupPrompt: 'inspect the remote workspace',
      launchPreferences: { model: 'remote-model' },
      presentation: 'background',
      title: 'remote agent'
    })

    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: REMOTE_SCOPE.connectionId,
        cwd: '/workspace',
        worktreeId: REMOTE_SCOPE.id,
        launchAgent: 'codex',
        command: expect.stringContaining('inspect the remote workspace')
      })
    )
    expect(spawn.mock.calls[0]?.[0]?.command).toContain('remote-model')
    expect(terminal).toMatchObject({
      handle: expect.stringMatching(/^term_/),
      ptyId: 'remote-pty-1',
      incarnationId: 'incarnation-1',
      executionHostId: toSshExecutionHostId(REMOTE_SCOPE.connectionId),
      worktreeId: REMOTE_SCOPE.id,
      title: 'remote agent',
      surface: 'background'
    })
  })
})
