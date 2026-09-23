import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { filesystem, getSshGitProvider, requireSshFilesystemProvider } = vi.hoisted(() => ({
  filesystem: {},
  getSshGitProvider: vi.fn(),
  requireSshFilesystemProvider: vi.fn()
}))

vi.mock('../providers/ssh-git-dispatch', () => ({ getSshGitProvider }))
vi.mock('../providers/ssh-filesystem-dispatch', () => ({ requireSshFilesystemProvider }))

import { createManagedComputerHostProjector } from './managed-computer-host-projector'

const generation = '10000000-0000-4000-8000-000000000001'
const roots: string[] = []

function validHostPublicKey(): string {
  const blob = Buffer.concat([
    Buffer.from([0, 0, 0, 11]),
    Buffer.from('ssh-ed25519'),
    Buffer.from([0, 0, 0, 32]),
    Buffer.alloc(32, 7)
  ])
  return `ssh-ed25519 ${blob.toString('base64')} computer-host`
}

async function harness(options?: {
  evidenceGeneration?: string
  hostPublicKey?: string
  currentGenerations?: string[]
}) {
  const root = await mkdtemp(join(tmpdir(), 'dorka-computer-bridge-'))
  roots.push(root)
  const identityFile = join(root, 'id_ed25519')
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
    generation,
    listExact: vi.fn(async () => []),
    acknowledgeExact: vi.fn(async () => undefined)
  }
  const connect = vi.fn(async () => ({ durableExitEvidence }))
  const readComputerSshBridgeEvidence = vi.fn(async () => ({
    executionGeneration: options?.evidenceGeneration ?? generation,
    hostPublicKey: options?.hostPublicKey ?? validHostPublicKey()
  }))
  const currentGenerations = options?.currentGenerations ?? [generation, generation]
  const getExecutionGeneration = vi.fn(async () => currentGenerations.shift() ?? generation)
  requireSshFilesystemProvider.mockReturnValue(filesystem)
  getSshGitProvider.mockReturnValue(git)
  const host = createManagedComputerHostProjector({
    computers: {
      getExecutionGeneration,
      resolveSshIdentityFile: vi.fn(async () => identityFile)
    },
    sessions: { connect, readComputerSshBridgeEvidence }
  })
  return { connect, git, host, identityFile, readComputerSshBridgeEvidence }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.clearAllMocks()
})

describe('ManagedComputerHostProjector', () => {
  it('projects a generation-fenced OpenSSH descriptor with a private known_hosts file', async () => {
    const { connect, git, host, identityFile, readComputerSshBridgeEvidence } = await harness()

    const connection = await host.connect('alpha')
    const knownHostsLine = `[dorka-computer-alpha]:2222 ${validHostPublicKey().split(' computer-host')[0]}`
    expect(connection).toEqual({
      connectionId: 'runtime-ssh-computer-alpha',
      executionHostId: 'ssh:runtime-ssh-computer-alpha',
      filesystem,
      git,
      sshBridge: {
        host: 'dorka-computer-alpha',
        port: 2222,
        username: 'ubuntu',
        identityFile,
        expectedExecutionGeneration: generation,
        knownHostsFile: join(dirname(identityFile), `known_hosts-${generation}`),
        knownHostsLine
      },
      durableExitEvidence: expect.any(Object)
    })
    if (!connection.sshBridge) {
      throw new Error('expected SSH bridge descriptor')
    }
    expect(await readFile(connection.sshBridge.knownHostsFile, 'utf8')).toBe(`${knownHostsLine}\n`)
    if (process.platform !== 'win32') {
      expect((await stat(connection.sshBridge.knownHostsFile)).mode & 0o777).toBe(0o600)
    }
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ identityFile }))
    expect(readComputerSshBridgeEvidence).toHaveBeenCalledWith('runtime-ssh-computer-alpha')
  })

  it('refuses stale Computer generations before writing bridge material', async () => {
    const { host, identityFile } = await harness({
      evidenceGeneration: '20000000-0000-4000-8000-000000000002'
    })

    await expect(host.connect('alpha')).rejects.toThrow('generation changed')
    await expect(
      stat(join(dirname(identityFile), `known_hosts-${generation}`))
    ).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('refuses a generation replaced while bridge evidence is read', async () => {
    const { host } = await harness({
      currentGenerations: [generation, '20000000-0000-4000-8000-000000000002']
    })

    await expect(host.connect('alpha')).rejects.toThrow('generation changed')
  })

  it('refuses malformed host public keys', async () => {
    const { host } = await harness({ hostPublicKey: 'ssh-ed25519 bm90LWFuLXNzaC1rZXk=' })

    await expect(host.connect('alpha')).rejects.toThrow('host public key is invalid')
  })
})
