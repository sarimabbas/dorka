import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ProcessResult } from '../../shared/child-process/run-process'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_EXECUTION_GENERATION_LABEL,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL
} from '../../shared/computer-runtime'
import { ComputerRuntimeManager, type ComputerCommandExecutor } from './computer-runtime-manager'

const serverId = 'server-01'

type EngineComputer = {
  generation: string
  image: string
  running: boolean
}

function processResult(stdout = '', stderr = '', code = 0): ProcessResult {
  return { code, signal: null, stdout, stderr, timedOut: false }
}

function computerId(reference: string | undefined): string {
  return (reference ?? '').replace('dorka-computer-', '')
}

function generationFrom(args: readonly string[]): string {
  return (
    args
      .find((argument) => argument.startsWith('dev.dorka.execution-generation='))
      ?.split('=')[1] ?? ''
  )
}

function inspection(id: string, computer: EngineComputer): object {
  return {
    Id: `engine-${id}`,
    Name: `/dorka-computer-${id}`,
    Config: {
      Image: computer.image,
      Labels: {
        [DORKA_MANAGED_LABEL]: 'true',
        [DORKA_SERVER_LABEL]: serverId,
        [DORKA_COMPUTER_LABEL]: id,
        [DORKA_EXECUTION_GENERATION_LABEL]: computer.generation
      }
    },
    State: {
      Running: computer.running,
      Status: computer.running ? 'running' : 'created'
    }
  }
}

function sharedEngine(): {
  computers: Map<string, EngineComputer>
  commands: (readonly string[])[]
  execute: ComputerCommandExecutor
} {
  const computers = new Map<string, EngineComputer>()
  const commands: (readonly string[])[] = []
  const execute: ComputerCommandExecutor = async ({ args = [] }) => {
    commands.push(args)
    if (args[0] === 'create') {
      const id = computerId(args[args.indexOf('--name') + 1])
      if (computers.has(id)) {
        return processResult('', 'already exists', 1)
      }
      computers.set(id, {
        generation: generationFrom(args),
        image: args.at(-1) ?? '',
        running: false
      })
      return processResult()
    }
    if (args[0] === 'inspect') {
      const values = args.slice(1).flatMap((reference) => {
        const id = computerId(reference)
        const computer = computers.get(id)
        return computer ? [inspection(id, computer)] : []
      })
      return processResult(JSON.stringify(values))
    }
    if (args[0] === 'start' || args[0] === 'stop') {
      const computer = computers.get(computerId(args[1]))
      if (!computer) {
        return processResult('', 'not found', 1)
      }
      computer.running = args[0] === 'start'
      return processResult()
    }
    if (args[0] === 'rm') {
      computers.delete(computerId(args.at(-1)))
      return processResult()
    }
    if (args[0] === 'ps') {
      return processResult([...computers.keys()].map((id) => `dorka-computer-${id}`).join('\n'))
    }
    return processResult()
  }
  return { computers, commands, execute }
}

async function storedRecords(directory: string): Promise<{
  computers: { spec: { id: string }; desiredState: string }[]
}> {
  return JSON.parse(await readFile(join(directory, 'computers.json'), 'utf8'))
}

describe('ComputerRuntimeManager shared-data concurrency', () => {
  it('preserves distinct creates and rejects a conflicting create across managers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dorka-computer-manager-concurrency-'))
    const engine = sharedEngine()
    const first = new ComputerRuntimeManager({
      dataDirectory: directory,
      serverId,
      execute: engine.execute
    })
    const second = new ComputerRuntimeManager({
      dataDirectory: directory,
      serverId,
      execute: engine.execute
    })

    await Promise.all([
      first.create({ id: 'alpha', image: 'safe/image:tag' }),
      second.create({ id: 'beta', image: 'safe/image:tag' })
    ])
    const duplicate = await Promise.allSettled([
      first.create({ id: 'gamma', image: 'safe/image:tag' }),
      second.create({ id: 'gamma', image: 'safe/image:tag' })
    ])

    expect(duplicate.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(duplicate.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(
      engine.commands.filter(
        (args) => args[0] === 'create' && args.includes('dorka-computer-gamma')
      )
    ).toHaveLength(1)
    expect((await storedRecords(directory)).computers.map(({ spec }) => spec.id).sort()).toEqual([
      'alpha',
      'beta',
      'gamma'
    ])
  })

  it('preserves overlapping state changes from distinct managers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dorka-computer-manager-concurrency-'))
    const engine = sharedEngine()
    const first = new ComputerRuntimeManager({
      dataDirectory: directory,
      serverId,
      execute: engine.execute
    })
    const second = new ComputerRuntimeManager({
      dataDirectory: directory,
      serverId,
      execute: engine.execute
    })
    await Promise.all([
      first.create({ id: 'alpha', image: 'safe/image:tag' }),
      second.create({ id: 'beta', image: 'safe/image:tag' })
    ])

    await Promise.all([first.start('alpha'), second.start('beta')])

    expect((await storedRecords(directory)).computers).toMatchObject([
      { desiredState: 'running' },
      { desiredState: 'running' }
    ])
  })

  it('serializes a conflicting state change and removal through the engine commit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dorka-computer-manager-concurrency-'))
    const engine = sharedEngine()
    const startEntered = Promise.withResolvers<void>()
    const releaseStart = Promise.withResolvers<void>()
    const execute = vi.fn<ComputerCommandExecutor>(async (spec) => {
      if (spec.args?.[0] === 'start') {
        startEntered.resolve()
        await releaseStart.promise
      }
      return engine.execute(spec)
    })
    const first = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })
    const second = new ComputerRuntimeManager({ dataDirectory: directory, serverId, execute })
    await first.create({ id: 'alpha', image: 'safe/image:tag' })

    const start = first.start('alpha')
    await startEntered.promise
    const remove = second.remove('alpha')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(engine.commands.some((args) => args[0] === 'rm')).toBe(false)

    releaseStart.resolve()
    await Promise.all([start, remove])

    expect((await storedRecords(directory)).computers).toEqual([])
    expect(engine.computers.has('alpha')).toBe(false)
  })
})
