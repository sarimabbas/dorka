import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProcessResult, ProcessSpec } from '../../shared/child-process/run-process'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_EXECUTION_GENERATION_LABEL,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL
} from '../../shared/computer-runtime'
import { createDorkadControlPlane, loadOrCreateServerId } from './dorkad-control-plane'

const directories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dorkad-control-plane-'))
  directories.push(directory)
  return directory
}

function result(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    ...overrides
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('createDorkadControlPlane', () => {
  it('keeps one server id in the active profile directory', async () => {
    const directory = await temporaryDirectory()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unavailable = vi.fn(async () => {
      throw new Error('docker missing')
    })

    const first = await createDorkadControlPlane({ dataDirectory: directory, execute: unavailable })
    const second = await createDorkadControlPlane({
      dataDirectory: directory,
      execute: unavailable
    })

    expect(second.health.serverId).toBe(first.health.serverId)
    expect((await readFile(join(directory, 'server-id'), 'utf8')).trim()).toBe(
      first.health.serverId
    )
    expect(first.agents.listAgents()).toEqual([])
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('Computer engine unavailable; Computer lifecycle is degraded')
    )
  })

  it('serializes concurrent server-id creation', async () => {
    const directory = await temporaryDirectory()

    const ids = await Promise.all([
      loadOrCreateServerId(directory),
      loadOrCreateServerId(directory),
      loadOrCreateServerId(directory)
    ])

    expect(new Set(ids)).toEqual(new Set([ids[0]]))
  })

  it('reports a server-id directory sync failure after publishing a valid id', async () => {
    const directory = await temporaryDirectory()

    await expect(
      loadOrCreateServerId(directory, {
        syncDirectory: async () => {
          throw new Error('directory sync failed')
        }
      })
    ).rejects.toThrow('directory sync failed')
    await expect(loadOrCreateServerId(directory)).resolves.toBe(
      (await readFile(join(directory, 'server-id'), 'utf8')).trim()
    )
  })

  it('does not reconcile when the Docker-compatible CLI is unavailable', async () => {
    const directory = await temporaryDirectory()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const execute = vi.fn(async (spec: ProcessSpec) =>
      result({ code: 1, stderr: `${spec.program}: cannot connect` })
    )

    const service = await createDorkadControlPlane({
      dataDirectory: directory,
      env: { DORKA_CONTAINER_ENGINE: '/usr/bin/podman' },
      execute
    })

    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ program: '/usr/bin/podman', args: ['info'] })
    )
    expect(service.health.computerEngine).toEqual({
      state: 'degraded',
      cliPath: '/usr/bin/podman',
      reason: '/usr/bin/podman: cannot connect'
    })
  })

  it('reconciles an available engine and applies the configured default image', async () => {
    const directory = await temporaryDirectory()
    let serverId = ''
    let executionGeneration = ''
    let createArgs: string[] = []
    const execute = vi.fn(async (spec: ProcessSpec) => {
      const args = spec.args ?? []
      if (args[0] === 'info') {
        return result()
      }
      if (args[0] === 'ps') {
        return result()
      }
      if (args[0] === 'create') {
        createArgs = [...args]
        executionGeneration =
          args
            .find((arg) => arg.startsWith(`${DORKA_EXECUTION_GENERATION_LABEL}=`))
            ?.split('=')[1] ?? ''
        return result()
      }
      if (args[0] === 'inspect') {
        return result({
          stdout: JSON.stringify([
            {
              Id: 'container-alpha',
              Name: '/dorka-computer-alpha',
              Config: {
                Image: 'registry.example/dorka-computer:v1',
                Labels: {
                  [DORKA_MANAGED_LABEL]: 'true',
                  [DORKA_SERVER_LABEL]: serverId,
                  [DORKA_COMPUTER_LABEL]: 'alpha',
                  [DORKA_EXECUTION_GENERATION_LABEL]: executionGeneration
                }
              },
              State: { Running: false, Status: 'created' }
            }
          ])
        })
      }
      return result({ code: 1, stderr: `unexpected command: ${args.join(' ')}` })
    })

    const service = await createDorkadControlPlane({
      dataDirectory: directory,
      env: { DORKA_COMPUTER_IMAGE: 'registry.example/dorka-computer:v1' },
      execute
    })
    serverId = service.health.serverId
    const computer = await service.createComputer({ id: 'alpha' })

    expect(service.health).toMatchObject({
      state: 'live',
      defaultComputerImage: 'registry.example/dorka-computer:v1',
      computerEngine: {
        state: 'live',
        cliPath: 'docker',
        reconciliation: { created: [], started: [], stopped: [], removed: [] }
      }
    })
    expect(createArgs.at(-1)).toBe('registry.example/dorka-computer:v1')
    expect(computer).toMatchObject({ id: 'alpha', state: 'created' })
  })
})
