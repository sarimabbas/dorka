import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ProcessResult, ProcessSpec } from '../../shared/child-process/run-process'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL
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
        'type=volume,source=dorka-computer-alpha-home,target=/home/dorka',
        '--mount',
        'type=volume,source=dorka-computer-alpha-workspace,target=/workspace',
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
            resources: { cpus: 2, memoryMb: 4096, pids: 512 }
          },
          desiredState: 'stopped'
        }
      ]
    })
  })

  it.each([
    { id: '../escape', image: 'safe/image:tag' },
    { id: 'UPPER', image: 'safe/image:tag' },
    { id: 'safe', image: '--privileged' },
    { id: 'safe', image: 'safe/image:tag', resources: { cpus: 0 } },
    { id: 'safe', image: 'safe/image:tag', resources: { memoryMb: 1 } },
    { id: 'safe', image: 'safe/image:tag', resources: { pids: 1 } }
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
