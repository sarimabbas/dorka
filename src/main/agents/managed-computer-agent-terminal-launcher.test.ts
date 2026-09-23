import { readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  requireSshFilesystemProvider: vi.fn(() => ({}))
}))
vi.mock('../../shared/secure-file', () => ({
  writeSecureFile: vi.fn(() => true)
}))
import { writeSecureFile } from '../../shared/secure-file'
import type { RuntimeTerminalCreate } from '../../shared/runtime-types'
import type { ManagedSshHostConnection } from '../ssh/managed-ssh-host-sessions'
import type { TerminalWorkspaceLaunchScope } from '../runtime/runtime-legacy-worker-terminal-recovery-types'
import type { TerminalCreateOptions } from '../runtime/runtime-terminal-contracts'
import type { AgentTerminalLaunch } from './agent-execution-service'
import { createManagedComputerAgentTerminalLauncher } from './managed-computer-agent-terminal-launcher'
import {
  createManagedComputerHostProjector,
  resolveComputerSourceDirectory
} from './managed-computer-host-projector'

const COMPUTER_GENERATION = '10000000-0000-4000-8000-000000000001'
const PRIVATE_DIRECTORY = join(tmpdir(), 'dorka-agent-launcher-test-private')
const HOST_PUBLIC_KEY = `ssh-ed25519 ${Buffer.concat([
  Buffer.from([0, 0, 0, 11]),
  Buffer.from('ssh-ed25519'),
  Buffer.from([0, 0, 0, 32]),
  Buffer.alloc(32, 7)
]).toString('base64')}`
const scratchDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    scratchDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
  vi.mocked(writeSecureFile).mockClear()
})

afterAll(async () => {
  await rm(PRIVATE_DIRECTORY, { recursive: true, force: true })
})

function launch(overrides: Partial<AgentTerminalLaunch> = {}): AgentTerminalLaunch {
  return {
    runId: 'run-1',
    agent: {
      id: 'agent-1',
      name: 'Reviewer',
      character: { color: 'blue', variant: 'owl' },
      job: 'Review',
      harnessId: 'pi',
      model: 'gpt-test',
      promptTemplate: 'Review carefully.',
      workingDirectory: '/workspace/repo',
      revision: 1,
      references: { version: 1, items: [] },
      createdAt: 1,
      updatedAt: 1
    },
    computer: {
      id: 'alpha',
      name: 'dorka-computer-alpha',
      image: 'dorka-computer:test',
      state: 'running'
    },
    computerExecutionGeneration: COMPUTER_GENERATION,
    prompt: 'Review carefully.\n\nInspect this change.',
    sourceDirectory: '/workspace/repo',
    ...overrides
  }
}

function fixture() {
  const resolveSshIdentityFile = vi.fn(
    async (_computerId: string) => '/server/private/alpha/id_ed25519'
  )
  const durableExitEvidence = {
    generation: COMPUTER_GENERATION,
    listExact: vi.fn(async () => []),
    acknowledgeExact: vi.fn(async () => undefined)
  }
  const connect = vi.fn<(_target: object) => Promise<ManagedSshHostConnection>>(async () => ({
    durableExitEvidence
  }))
  const createTerminalInWorkspaceScope = vi.fn(
    async (
      scope: TerminalWorkspaceLaunchScope,
      _options: TerminalCreateOptions
    ): Promise<RuntimeTerminalCreate> => {
      scratchDirectories.push(scope.path)
      return {
        handle: 'term_stable',
        ptyId: 'pty-1',
        incarnationId: 'inc-1',
        executionHostId: 'local',
        worktreeId: 'computer-agent-run-1',
        title: 'Reviewer'
      }
    }
  )
  const host = createManagedComputerHostProjector({
    computers: {
      getExecutionGeneration: vi.fn(async () => COMPUTER_GENERATION),
      resolveSshIdentityFile
    },
    sessions: {
      connect,
      readComputerSshBridgeEvidence: vi.fn(async () => ({
        executionGeneration: COMPUTER_GENERATION,
        hostPublicKey: HOST_PUBLIC_KEY
      }))
    }
  })
  const launcher = createManagedComputerAgentTerminalLauncher({
    host,
    privateDirectory: PRIVATE_DIRECTORY,
    runtime: { createTerminalInWorkspaceScope }
  })
  return { connect, createTerminalInWorkspaceScope, host, launcher, resolveSshIdentityFile }
}

describe('managed Computer agent terminal launcher', () => {
  it('launches Pi in an empty Server-local scratch directory with fixed Computer tools', async () => {
    const h = fixture()

    await expect(h.launcher(launch())).resolves.toEqual({
      terminalSessionId: 'term_stable',
      processIdentity: 'pty-1:inc-1',
      ptyId: 'pty-1'
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
    const [scope, options] = h.createTerminalInWorkspaceScope.mock.calls[0]!
    expect(scope).toEqual({
      id: 'computer-agent-run-1',
      path: join(PRIVATE_DIRECTORY, 'agent-runs', 'run-1', 'workspace'),
      connectionId: null,
      repo: null,
      folderWorkspace: null
    })
    expect(await readdir(scope.path)).toEqual([])
    expect(options).toEqual({
      startupAgent: 'pi',
      startupPrompt: 'Review carefully.\n\nInspect this change.',
      agentArgs: `--no-extensions --tools read,write,edit,bash --extension '${join(PRIVATE_DIRECTORY, 'dorka-computer-ssh.ts')}'`,
      launchPreferences: { model: 'gpt-test' },
      cwd: scope.path,
      env: {
        DORKA_COMPUTER_SSH_HOST: 'dorka-computer-alpha',
        DORKA_COMPUTER_SSH_PORT: '2222',
        DORKA_COMPUTER_SSH_USER: 'ubuntu',
        DORKA_COMPUTER_SSH_IDENTITY_FILE: '/server/private/alpha/id_ed25519',
        DORKA_COMPUTER_SSH_KNOWN_HOSTS_FILE: `/server/private/alpha/known_hosts-${COMPUTER_GENERATION}`,
        DORKA_COMPUTER_EXECUTION_GENERATION: COMPUTER_GENERATION,
        DORKA_COMPUTER_SOURCE_DIRECTORY: '/workspace/repo'
      },
      presentation: 'background',
      title: 'Reviewer',
      preAllocatedHandle: expect.stringMatching(/^term_/),
      agentSessionCreateOperationId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      onPtySpawnCommitted: expect.any(Function)
    })
    expect(writeSecureFile).toHaveBeenCalledWith(
      join(PRIVATE_DIRECTORY, 'dorka-computer-ssh.ts'),
      expect.stringContaining('DORKA_COMPUTER_SSH_HOST'),
      { durable: true }
    )
  })

  it.each(['claude', 'codex', 'aider', 'CODEX', ''])(
    'refuses non-Pi harness %j before connecting',
    async (harnessId) => {
      const h = fixture()
      await expect(h.launcher(launch({ agent: { ...launch().agent, harnessId } }))).rejects.toThrow(
        'harness is unsupported'
      )
      expect(h.resolveSshIdentityFile).not.toHaveBeenCalled()
      expect(h.createTerminalInWorkspaceScope).not.toHaveBeenCalled()
    }
  )

  it('refuses an old host without the direct Computer SSH bridge instead of spawning remotely', async () => {
    const h = fixture()
    const oldConnection = await h.host.connect('alpha')
    Reflect.deleteProperty(oldConnection, 'sshBridge')
    vi.spyOn(h.host, 'connect').mockResolvedValue(oldConnection)

    await expect(h.launcher(launch())).rejects.toThrow('generation is unverifiable')
    expect(h.createTerminalInWorkspaceScope).not.toHaveBeenCalled()
  })

  it('reports a committed local spawn failure as unverifiable without leaking credentials', async () => {
    const h = fixture()
    h.createTerminalInWorkspaceScope.mockImplementationOnce(async (scope, options) => {
      scratchDirectories.push(scope.path)
      options.onPtySpawnCommitted?.()
      throw new Error('/server/private/alpha/id_ed25519 was missing')
    })

    const error = await h.launcher(launch()).catch((cause: unknown) => cause)

    expect(String(error)).toContain('outcome is unverifiable')
    expect(String(error)).not.toContain('id_ed25519')
  })

  it('requires exact local terminal identity', async () => {
    const h = fixture()
    h.createTerminalInWorkspaceScope.mockImplementationOnce(async (scope) => {
      scratchDirectories.push(scope.path)
      return {
        handle: 'term_stable',
        ptyId: 'ssh:runtime-ssh-computer-alpha@@pty-1',
        incarnationId: 'inc-1',
        executionHostId: 'ssh:runtime-ssh-computer-alpha',
        worktreeId: 'computer-agent-run-1',
        title: 'Reviewer'
      }
    })
    await expect(h.launcher(launch())).rejects.toThrow('outcome is unverifiable')

    h.createTerminalInWorkspaceScope.mockImplementationOnce(async (scope) => {
      scratchDirectories.push(scope.path)
      return {
        handle: 'term_stable',
        ptyId: null,
        incarnationId: null,
        executionHostId: 'local',
        worktreeId: 'computer-agent-run-1',
        title: 'Reviewer'
      }
    })
    await expect(h.launcher(launch())).rejects.toThrow('outcome is unverifiable')
  })
})

describe('resolveComputerSourceDirectory', () => {
  it('defaults to and accepts normalized paths inside /workspace', () => {
    expect(resolveComputerSourceDirectory(undefined)).toBe('/workspace')
    expect(resolveComputerSourceDirectory('/workspace/repo')).toBe('/workspace/repo')
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
    expect(() => resolveComputerSourceDirectory(cwd)).toThrow()
  })
})
