import { describe, expect, it, vi } from 'vitest'
import type { RuntimeTerminalCreate } from '../../shared/runtime-types'
import type { TerminalWorkspaceLaunchScope } from '../runtime/runtime-legacy-worker-terminal-recovery-types'
import type { TerminalCreateOptions } from '../runtime/runtime-terminal-contracts'
import type { AgentTerminalLaunch } from './agent-execution-service'
import {
  createManagedComputerAgentTerminalLauncher,
  resolveComputerCwd
} from './managed-computer-agent-terminal-launcher'
import { createManagedComputerHostProjector } from './managed-computer-host-projector'

function launch(overrides: Partial<AgentTerminalLaunch> = {}): AgentTerminalLaunch {
  return {
    runId: 'run-1',
    agent: {
      id: 'agent-1',
      name: 'Reviewer',
      character: { color: 'blue', variant: 'owl' },
      job: 'Review',
      harnessId: 'codex',
      model: 'gpt-test',
      promptTemplate: 'Review carefully.',
      workingDirectory: '/workspace/repo',
      createdAt: 1,
      updatedAt: 1
    },
    computer: {
      id: 'alpha',
      name: 'dorka-computer-alpha',
      image: 'dorka-computer:test',
      state: 'running'
    },
    prompt: 'Review carefully.\n\nInspect this change.',
    ...overrides
  }
}

function fixture() {
  const resolveSshIdentityFile = vi.fn(
    async (_computerId: string) => '/server/private/alpha/id_ed25519'
  )
  const connect = vi.fn(async (_target: object) => undefined)
  const createTerminalInWorkspaceScope = vi.fn(
    async (
      _scope: TerminalWorkspaceLaunchScope,
      _options: TerminalCreateOptions
    ): Promise<RuntimeTerminalCreate> => ({
      handle: 'term_stable',
      ptyId: 'pty-1',
      incarnationId: 'inc-1',
      executionHostId: 'ssh:runtime-ssh-computer-alpha',
      worktreeId: 'computer-alpha',
      title: 'Reviewer'
    })
  )
  const host = createManagedComputerHostProjector({
    computers: { resolveSshIdentityFile },
    sessions: { connect }
  })
  const launcher = createManagedComputerAgentTerminalLauncher({
    host,
    runtime: { createTerminalInWorkspaceScope }
  })
  return { connect, createTerminalInWorkspaceScope, launcher, resolveSshIdentityFile }
}

describe('managed Computer agent terminal launcher', () => {
  it('connects the private Computer target and launches through the incumbent agent path', async () => {
    const h = fixture()

    await expect(h.launcher(launch())).resolves.toEqual({
      terminalSessionId: 'term_stable',
      processIdentity: 'pty-1:inc-1'
    })

    expect(h.connect).toHaveBeenCalledWith({
      id: 'runtime-ssh-computer-alpha',
      label: 'Computer alpha',
      owner: { type: 'on-demand-runtime', runtimeId: 'computer-alpha' },
      source: 'manual',
      host: 'dorka-computer-alpha',
      port: 2222,
      username: 'ubuntu',
      identityFile: '/server/private/alpha/id_ed25519',
      identitiesOnly: true,
      relayGracePeriodSeconds: 0
    })
    expect(h.createTerminalInWorkspaceScope).toHaveBeenCalledWith(
      {
        id: 'computer-alpha',
        path: '/workspace',
        connectionId: 'runtime-ssh-computer-alpha',
        repo: null,
        folderWorkspace: null
      },
      expect.objectContaining({
        startupAgent: 'codex',
        startupPrompt: 'Review carefully.\n\nInspect this change.',
        launchPreferences: { model: 'gpt-test' },
        cwd: '/workspace/repo',
        presentation: 'background',
        title: 'Reviewer',
        preAllocatedHandle: expect.stringMatching(/^term_/),
        agentSessionCreateOperationId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
      })
    )
  })

  it.each(['aider', 'CODEX', ''])('refuses non-allowlisted harness %j', async (harnessId) => {
    const h = fixture()
    await expect(h.launcher(launch({ agent: { ...launch().agent, harnessId } }))).rejects.toThrow(
      'harness is unsupported'
    )
    expect(h.resolveSshIdentityFile).not.toHaveBeenCalled()
  })

  it('reports a committed spawn failure as unverifiable without leaking the underlying error', async () => {
    const h = fixture()
    h.createTerminalInWorkspaceScope.mockImplementationOnce(async (_scope, options) => {
      options.onPtySpawnCommitted?.()
      throw new Error('/server/private/alpha/id_ed25519 was missing')
    })

    const error = await h.launcher(launch()).catch((cause: unknown) => cause)

    expect(String(error)).toContain('outcome is unverifiable')
    expect(String(error)).not.toContain('id_ed25519')
  })

  it('requires the target execution host and complete terminal identity', async () => {
    const h = fixture()
    h.createTerminalInWorkspaceScope.mockResolvedValueOnce({
      handle: 'term_stable',
      ptyId: 'pty-1',
      incarnationId: 'inc-1',
      executionHostId: 'local',
      worktreeId: 'computer-alpha',
      title: 'Reviewer'
    })
    await expect(h.launcher(launch())).rejects.toThrow('outcome is unverifiable')

    h.createTerminalInWorkspaceScope.mockResolvedValueOnce({
      handle: 'term_stable',
      ptyId: null,
      incarnationId: null,
      executionHostId: 'ssh:runtime-ssh-computer-alpha',
      worktreeId: 'computer-alpha',
      title: 'Reviewer'
    })
    await expect(h.launcher(launch())).rejects.toThrow('outcome is unverifiable')
  })
})

describe('resolveComputerCwd', () => {
  it('defaults to and accepts normalized paths inside /workspace', () => {
    expect(resolveComputerCwd(undefined)).toBe('/workspace')
    expect(resolveComputerCwd('/workspace/repo')).toBe('/workspace/repo')
  })

  it.each([
    'workspace/repo',
    '/workspace-other',
    '/workspace//repo',
    '/workspace/../repo',
    '/workspace/../../etc',
    '/workspace\\repo',
    '/workspace/repo\0escape'
  ])('rejects %j', (cwd) => {
    expect(() => resolveComputerCwd(cwd)).toThrow()
  })
})
