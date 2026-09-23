import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as NodeCrypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessResult, ProcessSpec } from '../../shared/child-process/run-process'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_EXECUTION_GENERATION_LABEL,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL,
  type ComputerCreateSpec
} from '../../shared/computer-runtime'
import { ComputerRuntimeManager, type ComputerCommandExecutor } from './computer-runtime-manager'

const executionGeneration = '10000000-0000-4000-8000-000000000001'
const replacementGeneration = '20000000-0000-4000-8000-000000000002'
const serverId = 'server-01'
const randomUUIDMock = vi.hoisted(() => vi.fn())

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeCrypto>()),
  randomUUID: randomUUIDMock
}))

beforeEach(() => {
  randomUUIDMock.mockReset().mockReturnValue(executionGeneration)
})

function processResult(stdout = '', stderr = '', code = 0): ProcessResult {
  return { code, signal: null, stdout, stderr, timedOut: false }
}

function inspection(
  id: string,
  state = 'created',
  running = false,
  owner = serverId,
  generation = executionGeneration
): object {
  return {
    Id: `engine-${id}`,
    Name: `/dorka-computer-${id}`,
    Config: {
      Image: 'ghcr.io/dorka/runtime:1.0',
      Labels: {
        [DORKA_MANAGED_LABEL]: 'true',
        [DORKA_SERVER_LABEL]: owner,
        [DORKA_COMPUTER_LABEL]: id,
        [DORKA_EXECUTION_GENERATION_LABEL]: generation
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
        '--label',
        `dev.dorka.execution-generation=${executionGeneration}`,
        '--network',
        'dorka-runtimes',
        '--cpus',
        '2',
        '--memory',
        '4096m',
        '--pids-limit',
        '512',
        '--shm-size',
        '2g',
        '--mount',
        'type=volume,source=dorka-computer-alpha-home,target=/home/ubuntu',
        '--mount',
        'type=volume,source=dorka-computer-alpha-workspace,target=/workspace',
        '--mount',
        'type=volume,source=dorka-computer-alpha-ssh-host-keys,target=/etc/ssh',
        '--env',
        `DORKA_SSH_PUBLIC_KEY=${publicKey}`,
        '--env',
        `DORKA_EXECUTION_GENERATION=${executionGeneration}`,
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
          desiredState: 'stopped',
          executionGeneration
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
      expect.stringMatching(/^DORKA_SSH_PUBLIC_KEY=ssh-ed25519 /),
      '--env',
      `DORKA_EXECUTION_GENERATION=${executionGeneration}`
    ])
    expect(args.join(' ')).not.toContain('computer-ssh-keys')
    expect(args.join(' ')).not.toContain('OPENSSH PRIVATE KEY')
    expect(args.at(-1)).toBe('safe/image:tag')
  })

  it('gets and plans redacted configuration with revision conflicts free of engine effects', async () => {
    const directory = await dataDirectory()
    const execute = vi
      .fn<ComputerCommandExecutor>()
      .mockResolvedValueOnce(processResult())
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha')])))
    const manager = new ComputerRuntimeManager({
      dataDirectory: directory,
      serverId,
      allowedMountSources: ['/srv/dorka/shared'],
      execute
    })
    await manager.create({
      id: 'alpha',
      image: 'safe/image:tag',
      environment: { TOKEN: 'never-return-this' }
    })
    execute.mockClear()

    const snapshot = await manager.getConfiguration('alpha')
    const conflict = await manager.planConfiguration('alpha', replacementGeneration, {
      resources: { cpus: 2, memoryMb: 4096, pids: 512 },
      environment: { preserve: ['TOKEN'], set: {} },
      premounts: []
    })
    const planned = await manager.planConfiguration('alpha', executionGeneration, {
      resources: { cpus: 4, memoryMb: 4096, pids: 512 },
      environment: { preserve: [], set: { MODE: 'new-private-value' } },
      premounts: [{ source: '/srv/dorka/shared', target: '/shared' }]
    })

    expect(snapshot.configuration.environment).toEqual(['TOKEN'])
    expect(conflict).toEqual({ outcome: 'conflict', currentRevision: executionGeneration })
    expect(planned).toMatchObject({
      outcome: 'planned',
      plan: { replacementRequired: true, changes: { resources: ['cpus'] } }
    })
    expect(JSON.stringify({ snapshot, conflict, planned })).not.toContain('never-return-this')
    expect(JSON.stringify({ snapshot, conflict, planned })).not.toContain('new-private-value')
    expect(execute).not.toHaveBeenCalled()
  })

  it('replaces a stopped Computer configuration with a new fenced incarnation', async () => {
    randomUUIDMock
      .mockReturnValueOnce(executionGeneration)
      .mockReturnValueOnce(replacementGeneration)
    let activeGeneration = executionGeneration
    const execute = vi.fn<ComputerCommandExecutor>(async ({ args = [] }) => {
      if (args[0] === 'inspect') {
        return processResult(
          JSON.stringify([inspection('alpha', 'created', false, serverId, activeGeneration)])
        )
      }
      if (args[0] === 'create') {
        const label = args.find((arg) => arg.startsWith(`${DORKA_EXECUTION_GENERATION_LABEL}=`))
        activeGeneration = label?.split('=')[1] ?? activeGeneration
      }
      return processResult()
    })
    const directory = await dataDirectory()
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })
    await manager.create({
      id: 'alpha',
      image: 'safe/image:tag',
      environment: { TOKEN: 'preserved-value', OLD: 'removed-value' }
    })
    execute.mockClear()

    const result = await manager.replaceConfiguration('alpha', executionGeneration, {
      resources: { cpus: 4, memoryMb: 8192, pids: 256 },
      environment: { preserve: ['TOKEN'], set: { MODE: 'replacement-value' } },
      premounts: []
    })

    expect(result).toMatchObject({
      outcome: 'replaced',
      snapshot: {
        revision: replacementGeneration,
        configuration: { environment: ['MODE', 'TOKEN'] }
      }
    })
    expect(JSON.stringify(result)).not.toContain('preserved-value')
    expect(JSON.stringify(result)).not.toContain('replacement-value')
    expect(execute.mock.calls.map(([call]) => call.args?.[0])).toEqual([
      'inspect',
      'rm',
      'create',
      'inspect'
    ])
    const stored = JSON.parse(await readFile(join(directory, 'computers.json'), 'utf8'))
    expect(stored.computers[0]).toMatchObject({
      executionGeneration: replacementGeneration,
      spec: {
        resources: { cpus: 4, memoryMb: 8192, pids: 256 },
        environment: { TOKEN: 'preserved-value', MODE: 'replacement-value' }
      }
    })
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
    },
    {
      id: 'safe',
      image: 'safe/image:tag',
      mounts: [{ source: '/srv/dorka/shared', target: '/etc/ssh' }]
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
    const directory = await dataDirectory()
    await writeFile(
      join(directory, 'computers.json'),
      JSON.stringify({
        version: 1,
        computers: [
          {
            spec: { id: 'alpha', image: 'safe/image:tag' },
            desiredState: 'stopped',
            executionGeneration
          }
        ]
      })
    )
    const execute = vi
      .fn<ComputerCommandExecutor>()
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha', 'running', true)])))
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha', 'created', false)])))
      .mockResolvedValueOnce(processResult(JSON.stringify([inspection('alpha', 'exited', false)])))
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

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

  it('replaces a container whose immutable generation does not match the durable record', async () => {
    const directory = await dataDirectory()
    await writeFile(
      join(directory, 'computers.json'),
      JSON.stringify({
        version: 1,
        computers: [
          {
            spec: { id: 'alpha', image: 'safe/image:tag' },
            desiredState: 'stopped',
            executionGeneration
          }
        ]
      })
    )
    const execute = vi.fn<ComputerCommandExecutor>(async ({ args = [] }) => {
      if (args[0] === 'ps') {
        return processResult('engine-alpha\n')
      }
      if (args[0] === 'inspect') {
        return processResult(
          JSON.stringify([inspection('alpha', 'created', false, serverId, replacementGeneration)])
        )
      }
      return processResult()
    })
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

    await expect(manager.reconcile()).resolves.toMatchObject({ created: ['alpha'] })
    expect(execute.mock.calls.map(([spec]) => spec.args)).toContainEqual([
      'rm',
      '--force',
      'dorka-computer-alpha'
    ])
    expect(execute.mock.calls.map(([spec]) => spec.args)).toContainEqual(
      expect.arrayContaining(['create', `dev.dorka.execution-generation=${executionGeneration}`])
    )
  })

  it('preserves generation because out-of-band volume replacement is unsupported', async () => {
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
    const injectedKeys = createArgs.map((args) =>
      args.find((arg) => arg.startsWith('DORKA_SSH_PUBLIC_KEY='))
    )
    const generations = createArgs.map((args) =>
      args.find((arg) => arg.startsWith('DORKA_EXECUTION_GENERATION='))
    )
    expect(injectedKeys).toHaveLength(2)
    expect(injectedKeys[1]).toBe(injectedKeys[0])
    expect(generations).toEqual([
      `DORKA_EXECUTION_GENERATION=${executionGeneration}`,
      `DORKA_EXECUTION_GENERATION=${executionGeneration}`
    ])
  })

  it('gives a deleted and recreated Computer a new generation without changing its identity', async () => {
    const directory = await dataDirectory()
    randomUUIDMock
      .mockReturnValueOnce(executionGeneration)
      .mockReturnValueOnce(replacementGeneration)
    const generations = new Map<string, string>()
    const createArgs: (readonly string[])[] = []
    const execute = vi.fn<ComputerCommandExecutor>(async ({ args = [] }) => {
      const reference = args.includes('--name') ? args[args.indexOf('--name') + 1] : args.at(-1)
      const id = (reference ?? '').replace('dorka-computer-', '')
      if (args[0] === 'create') {
        const generation = (
          args.find((arg) => arg.startsWith('dev.dorka.execution-generation=')) ?? ''
        )
          .split('=')
          .at(1)
        generations.set(id, generation ?? '')
        createArgs.push(args)
        return processResult()
      }
      if (args[0] === 'inspect') {
        return processResult(
          JSON.stringify([inspection(id, 'created', false, serverId, generations.get(id))])
        )
      }
      if (args[0] === 'rm') {
        generations.delete(id)
      }
      return processResult()
    })
    const manager = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })

    await manager.create({ id: 'alpha', image: 'safe/image:tag' })
    await manager.remove('alpha')
    await manager.create({ id: 'alpha', image: 'safe/image:tag' })

    const labels = createArgs.map((args) =>
      args.find((arg) => arg.startsWith('dev.dorka.execution-generation='))
    )
    const keys = createArgs.map((args) =>
      args.find((arg) => arg.startsWith('DORKA_SSH_PUBLIC_KEY='))
    )
    expect(labels).toEqual([
      `dev.dorka.execution-generation=${executionGeneration}`,
      `dev.dorka.execution-generation=${replacementGeneration}`
    ])
    expect(keys[1]).toBe(keys[0])
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
