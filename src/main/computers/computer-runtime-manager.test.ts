import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ProcessResult, ProcessSpec } from '../../shared/child-process/run-process'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL,
  type ComputerCreateSpec
} from '../../shared/computer-runtime'
import { ComputerRuntimeManager, type ComputerCommandExecutor } from './computer-runtime-manager'

const serverId = 'server-01'

function processResult(stdout = '', stderr = '', code = 0): ProcessResult {
  return { code, signal: null, stdout, stderr, timedOut: false }
}

function inspection(id: string, state = 'created', running = false, owner = serverId): object {
  return {
    Id: `engine-${id}`,
    Name: `/dorka-computer-${id}`,
    Config: {
      Image: 'ghcr.io/dorka/runtime:1.0',
      Labels: {
        [DORKA_MANAGED_LABEL]: 'true',
        [DORKA_SERVER_LABEL]: owner,
        [DORKA_COMPUTER_LABEL]: id
      }
    },
    State: { Running: running, Status: state }
  }
}

async function dataDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dorka-computers-'))
}

describe('ComputerRuntimeManager', () => {
  it('uses an exact create template and persists the desired record', async () => {
    const directory = await dataDirectory()
    const execute = vi
      .fn<ComputerCommandExecutor>()
      .mockResolvedValueOnce(processResult('engine-alpha\n'))
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha')])))
    const manager = new ComputerRuntimeManager({
      dataDirectory: directory,
      serverId,
      enginePath: '/usr/bin/docker',
      execute
    })

    await manager.create({ id: 'alpha', image: 'ghcr.io/dorka/runtime:1.0' })
    const publicKey = (
      await readFile(join(directory, 'computer-ssh-keys', 'alpha', 'id_ed25519.pub'), 'utf8')
    ).trim()

    expect(execute.mock.calls[0]?.[0]).toEqual({
      program: '/usr/bin/docker',
      args: [
        'create',
        '--name',
        'dorka-computer-alpha',
        '--label',
        'dev.dorka.managed=true',
        '--label',
        'dev.dorka.server=server-01',
        '--label',
        'dev.dorka.computer=alpha',
        '--network',
        'dorka-runtimes',
        '--cpus',
        '2',
        '--memory',
        '4096m',
        '--pids-limit',
        '512',
        '--mount',
        'type=volume,source=dorka-computer-alpha-home,target=/home/ubuntu',
        '--mount',
        'type=volume,source=dorka-computer-alpha-workspace,target=/workspace',
        '--env',
        `DORKA_SSH_PUBLIC_KEY=${publicKey}`,
        '--workdir',
        '/workspace',
        'ghcr.io/dorka/runtime:1.0'
      ]
    })
    expect(execute.mock.calls[1]?.[0]).toEqual({
      program: '/usr/bin/docker',
      args: ['inspect', 'dorka-computer-alpha']
    })
    expect(JSON.parse(await readFile(join(directory, 'computers.json'), 'utf8'))).toEqual({
      version: 1,
      computers: [
        {
          spec: {
            id: 'alpha',
            image: 'ghcr.io/dorka/runtime:1.0',
            resources: { cpus: 2, memoryMb: 4096, pids: 512 },
            environment: {},
            mounts: []
          },
          desiredState: 'stopped'
        }
      ]
    })
  })

  it('serializes concurrent direct mutations before reading and saving records', async () => {
    const directory = await dataDirectory()
    const firstCreate = Promise.withResolvers<ProcessResult>()
    const commands: (readonly string[])[] = []
    const execute = vi.fn<ComputerCommandExecutor>(async ({ args = [] }) => {
      commands.push(args)
      if (args[0] === 'create' && args[2] === 'dorka-computer-alpha') {
        return firstCreate.promise
      }
      if (args[0] === 'inspect') {
        const id = args[1]?.replace('dorka-computer-', '') ?? ''
        return processResult(JSON.stringify([inspection(id)]))
      }
      return processResult()
    })
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

    const alpha = manager.create({ id: 'alpha', image: 'safe/image:tag' })
    const beta = manager.create({ id: 'beta', image: 'safe/image:tag' })

    await vi.waitFor(() => {
      expect(commands).toEqual([
        expect.arrayContaining(['create', '--name', 'dorka-computer-alpha'])
      ])
    })
    firstCreate.resolve(processResult())
    await Promise.all([alpha, beta])

    expect(commands.filter(([command]) => command === 'create')).toEqual([
      expect.arrayContaining(['--name', 'dorka-computer-alpha']),
      expect.arrayContaining(['--name', 'dorka-computer-beta'])
    ])
    const stored = JSON.parse(await readFile(join(directory, 'computers.json'), 'utf8'))
    expect(stored.computers.map((record: { spec: { id: string } }) => record.spec.id)).toEqual([
      'alpha',
      'beta'
    ])
  })

  it('continues queued mutations after an earlier mutation fails', async () => {
    const directory = await dataDirectory()
    const execute = vi.fn<ComputerCommandExecutor>(async ({ args = [] }) => {
      if (args[0] === 'create' && args[2] === 'dorka-computer-alpha') {
        return processResult('', 'create failed', 1)
      }
      if (args[0] === 'inspect') {
        return processResult(JSON.stringify([inspection('beta')]))
      }
      return processResult()
    })
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

    const alpha = manager.create({ id: 'alpha', image: 'safe/image:tag' })
    const beta = manager.create({ id: 'beta', image: 'safe/image:tag' })

    await expect(alpha).rejects.toThrow('create failed')
    await expect(beta).resolves.toMatchObject({ id: 'beta' })
    expect(execute.mock.calls.map(([spec]) => spec.args?.[2]).filter(Boolean)).toEqual([
      'dorka-computer-alpha',
      'dorka-computer-beta'
    ])
  })

  it('adds validated environment and exact allowlisted premounts without engine flags', async () => {
    const execute = vi
      .fn<ComputerCommandExecutor>()
      .mockResolvedValueOnce(processResult('engine-alpha\n'))
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha')])))
    const manager = new ComputerRuntimeManager({
      dataDirectory: await dataDirectory(),
      serverId,
      allowedMountSources: ['/srv/dorka/shared'],
      execute
    })

    await manager.create({
      id: 'alpha',
      image: 'safe/image:tag',
      environment: { FEATURE_FLAG: 'enabled', LITERAL: '--privileged' },
      mounts: [
        { source: '/srv/dorka/shared', target: '/shared' },
        { source: '/srv/dorka/shared', target: '/imports', readOnly: false }
      ]
    })

    const args = execute.mock.calls[0]?.[0].args ?? []
    expect(args.slice(args.indexOf('--env'), args.indexOf('--workdir'))).toEqual([
      '--env',
      'FEATURE_FLAG=enabled',
      '--env',
      'LITERAL=--privileged',
      '--mount',
      'type=bind,source=/srv/dorka/shared,target=/shared,readonly',
      '--mount',
      'type=bind,source=/srv/dorka/shared,target=/imports',
      '--env',
      expect.stringMatching(/^DORKA_SSH_PUBLIC_KEY=ssh-ed25519 /)
    ])
    expect(args.join(' ')).not.toContain('computer-ssh-keys')
    expect(args.join(' ')).not.toContain('OPENSSH PRIVATE KEY')
    expect(args.at(-1)).toBe('safe/image:tag')
  })

  it.each<ComputerCreateSpec>([
    { id: '../escape', image: 'safe/image:tag' },
    { id: 'UPPER', image: 'safe/image:tag' },
    { id: 'safe', image: '--privileged' },
    { id: 'safe', image: 'safe/image:tag', resources: { cpus: 0 } },
    { id: 'safe', image: 'safe/image:tag', resources: { memoryMb: 1 } },
    { id: 'safe', image: 'safe/image:tag', resources: { pids: 1 } },
    { id: 'safe', image: 'safe/image:tag', environment: { 'BAD-NAME': 'value' } },
    { id: 'safe', image: 'safe/image:tag', environment: { DORKA_SSH_PUBLIC_KEY: 'value' } },
    { id: 'safe', image: 'safe/image:tag', environment: { SAFE: 'bad\0value' } },
    {
      id: 'safe',
      image: 'safe/image:tag',
      mounts: [{ source: '/srv/not-allowed', target: '/shared' }]
    },
    {
      id: 'safe',
      image: 'safe/image:tag',
      mounts: [{ source: '/home/operator', target: '/shared' }]
    },
    {
      id: 'safe',
      image: 'safe/image:tag',
      mounts: [{ source: '/srv/dorka/shared,readonly', target: '/shared' }]
    },
    {
      id: 'safe',
      image: 'safe/image:tag',
      mounts: [{ source: '/srv/dorka/shared', target: '/var/run/docker.sock' }]
    },
    {
      id: 'safe',
      image: 'safe/image:tag',
      mounts: [{ source: '/srv/dorka/shared', target: '/home/ubuntu' }]
    }
  ])('rejects invalid create input without executing: $id $image', async (spec) => {
    const execute = vi.fn<ComputerCommandExecutor>()
    const manager = new ComputerRuntimeManager({
      dataDirectory: await dataDirectory(),
      serverId,
      execute
    })

    await expect(manager.create(spec)).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  it('parses running, created, and stopped lifecycle states', async () => {
    const execute = vi
      .fn<ComputerCommandExecutor>()
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha', 'running', true)])))
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha', 'created', false)])))
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha', 'exited', false)])))
    const manager = new ComputerRuntimeManager({
      dataDirectory: await dataDirectory(),
      serverId,
      execute
    })

    await expect(manager.inspect('alpha')).resolves.toMatchObject({ state: 'running' })
    await expect(manager.inspect('alpha')).resolves.toMatchObject({ state: 'created' })
    await expect(manager.inspect('alpha')).resolves.toMatchObject({ state: 'stopped' })
  })

  it('restores persisted desired records and reconciles only owned labels', async () => {
    const directory = await dataDirectory()
    await writeFile(
      join(directory, 'computers.json'),
      JSON.stringify({
        version: 1,
        computers: [
          { spec: { id: 'alpha', image: 'ghcr.io/dorka/runtime:1.0' }, desiredState: 'running' },
          { spec: { id: 'beta', image: 'ghcr.io/dorka/runtime:1.0' }, desiredState: 'stopped' }
        ]
      })
    )
    const execute = vi.fn<ComputerCommandExecutor>(async (spec: ProcessSpec) => {
      if (spec.args?.[0] === 'ps') {
        return processResult('engine-beta\nengine-orphan\nengine-foreign\n')
      }
      if (spec.args?.[0] === 'inspect') {
        return processResult(
          JSON.stringify([
            inspection('beta', 'running', true),
            inspection('orphan', 'exited'),
            inspection('foreign', 'running', true, 'another-server')
          ])
        )
      }
      return processResult()
    })
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

    await expect(manager.reconcile()).resolves.toEqual({
      created: ['alpha'],
      started: ['alpha'],
      stopped: ['beta'],
      removed: ['orphan']
    })
    expect(execute.mock.calls[0]?.[0].args).toEqual([
      'ps',
      '--all',
      '--quiet',
      '--filter',
      'label=dev.dorka.managed=true',
      '--filter',
      'label=dev.dorka.server=server-01'
    ])
    expect(execute.mock.calls.map((call) => call[0].args)).not.toContainEqual([
      'rm',
      '--force',
      'dorka-computer-foreign'
    ])
  })

  it('reuses the same public key when reconciliation recreates a Computer', async () => {
    const directory = await dataDirectory()
    await writeFile(
      join(directory, 'computers.json'),
      JSON.stringify({
        version: 1,
        computers: [{ spec: { id: 'alpha', image: 'safe/image:tag' }, desiredState: 'stopped' }]
      })
    )
    const execute = vi.fn<ComputerCommandExecutor>(async ({ args = [] }) =>
      args[0] === 'ps' ? processResult('') : processResult()
    )
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

    await manager.reconcile()
    await manager.reconcile()

    const createArgs = execute.mock.calls
      .map(([spec]) => spec.args ?? [])
      .filter(([command]) => command === 'create')
    const injectedKeys = createArgs.map((args) => args[args.lastIndexOf('--env') + 1])
    expect(injectedKeys).toHaveLength(2)
    expect(injectedKeys[1]).toBe(injectedKeys[0])
  })

  it('refuses lifecycle operations when ownership labels do not match', async () => {
    const directory = await dataDirectory()
    await writeFile(
      join(directory, 'computers.json'),
      JSON.stringify({
        version: 1,
        computers: [{ spec: { id: 'alpha', image: 'safe/image:tag' }, desiredState: 'stopped' }]
      })
    )
    const execute = vi
      .fn<ComputerCommandExecutor>()
      .mockResolvedValue(
        processResult(JSON.stringify([inspection('alpha', 'created', false, 'other')]))
      )
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

    await expect(manager.start('alpha')).rejects.toThrow('not owned')
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
