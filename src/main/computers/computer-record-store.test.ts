import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ComputerRecord } from '../../shared/computer-runtime'
import { ComputerRecordStore } from './computer-record-store'

const directories: string[] = []
const executionGeneration = '10000000-0000-4000-8000-000000000001'

function record(id: string, desiredState: 'running' | 'stopped' = 'stopped'): ComputerRecord {
  return {
    spec: { id, image: 'safe/image:tag' },
    desiredState,
    executionGeneration
  }
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dorka-computer-records-'))
  directories.push(directory)
  return directory
}

async function writeRecords(directory: string, computers: ComputerRecord[]): Promise<void> {
  await writeFile(join(directory, 'computers.json'), JSON.stringify({ version: 1, computers }))
}

function noOpCommit(): {
  beforeCommit: () => Promise<void>
  afterCommit: () => Promise<void>
} {
  return {
    beforeCommit: async () => undefined,
    afterCommit: async () => undefined
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('ComputerRecordStore', () => {
  it('serializes legacy migration across distinct stores around one persisted generation', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'computers.json')
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        computers: [{ spec: { id: 'alpha', image: 'safe/image:tag' }, desiredState: 'running' }]
      })
    )

    const [first, second] = await Promise.all([
      new ComputerRecordStore(directory).list(),
      new ComputerRecordStore(directory).list()
    ])
    const persisted: unknown = JSON.parse(await readFile(path, 'utf8'))

    expect(first[0]?.executionGeneration).toMatch(/^[0-9a-f-]{36}$/)
    expect(second[0]?.executionGeneration).toBe(first[0]?.executionGeneration)
    expect(persisted).toEqual({ version: 1, computers: first })
  })

  it('does not deadlock a mutation racing legacy migration in another store', async () => {
    const directory = await temporaryDirectory()
    await writeFile(
      join(directory, 'computers.json'),
      JSON.stringify({
        version: 1,
        computers: [{ spec: { id: 'alpha', image: 'safe/image:tag' }, desiredState: 'stopped' }]
      })
    )
    const reader = new ComputerRecordStore(directory)
    const mutator = new ComputerRecordStore(directory)

    await Promise.all([reader.list(), mutator.setDesiredState('alpha', 'running', noOpCommit())])

    await expect(reader.get('alpha')).resolves.toMatchObject({
      desiredState: 'running',
      executionGeneration: expect.stringMatching(/^[0-9a-f-]{36}$/)
    })
  })

  it('uses exclusive random temporary files without overwriting a colliding name', async () => {
    const directory = await temporaryDirectory()
    await writeRecords(directory, [record('alpha')])
    const collisionPath = join(directory, `computers.json.${process.pid}.forced-collision.tmp`)
    await writeFile(collisionPath, 'do not overwrite')
    const ids = ['forced-collision', 'unique']
    const store = new ComputerRecordStore(directory, { temporaryId: () => ids.shift() ?? 'unique' })

    await store.setDesiredState('alpha', 'running', noOpCommit())

    expect(await readFile(collisionPath, 'utf8')).toBe('do not overwrite')
    await expect(store.get('alpha')).resolves.toMatchObject({ desiredState: 'running' })
  })

  it.each([
    ['before-file-sync', 'stopped'],
    ['after-file-sync', 'stopped'],
    ['after-rename', 'running'],
    ['before-directory-sync', 'running']
  ] as const)('keeps a valid store after a fault at %s', async (faultPoint, expectedState) => {
    const directory = await temporaryDirectory()
    await writeRecords(directory, [record('alpha')])
    const store = new ComputerRecordStore(directory, {
      onPersistencePoint: (point) => {
        if (point === faultPoint) {
          throw new Error(`fault at ${point}`)
        }
      }
    })

    await expect(store.setDesiredState('alpha', 'running', noOpCommit())).rejects.toThrow(
      `fault at ${faultPoint}`
    )

    const recovered = new ComputerRecordStore(directory)
    await expect(recovered.get('alpha')).resolves.toMatchObject({ desiredState: expectedState })
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('fences spec replacement by execution generation without effects on conflict', async () => {
    const directory = await temporaryDirectory()
    await writeRecords(directory, [record('alpha')])
    const store = new ComputerRecordStore(directory)
    let prepared = false
    let applied = false

    const result = await store.replaceSpec(
      'alpha',
      '40000000-0000-4000-8000-000000000004',
      () => {
        prepared = true
        return { id: 'alpha', image: 'replacement:test' }
      },
      {
        beforeCommit: async () => {
          applied = true
        },
        afterCommit: async () => undefined
      }
    )

    expect(result).toEqual({ kind: 'conflict', currentRevision: executionGeneration })
    expect(prepared).toBe(false)
    expect(applied).toBe(false)
    await expect(store.get('alpha')).resolves.toEqual(record('alpha'))
  })

  it('rotates generation only for a changed spec replacement', async () => {
    const directory = await temporaryDirectory()
    await writeRecords(directory, [record('alpha')])
    const store = new ComputerRecordStore(directory)

    const unchanged = await store.replaceSpec('alpha', executionGeneration, () => null, {
      beforeCommit: async () => {
        throw new Error('unexpected effect')
      },
      afterCommit: async () => undefined
    })
    expect(unchanged).toMatchObject({ kind: 'unchanged', record: record('alpha') })

    const replaced = await store.replaceSpec(
      'alpha',
      executionGeneration,
      () => ({ id: 'alpha', image: 'replacement:test' }),
      {
        beforeCommit: async (current, next) => {
          expect(current.executionGeneration).toBe(executionGeneration)
          expect(next.executionGeneration).not.toBe(executionGeneration)
        },
        afterCommit: async (next) => next.executionGeneration
      }
    )
    expect(replaced).toMatchObject({
      kind: 'replaced',
      record: { spec: { image: 'replacement:test' } }
    })
    if (replaced.kind === 'replaced') {
      expect(replaced.value).toBe(replaced.record.executionGeneration)
      expect(replaced.record.executionGeneration).not.toBe(executionGeneration)
    }
  })

  it('reports a directory sync failure after publishing a valid record', async () => {
    const directory = await temporaryDirectory()
    await writeRecords(directory, [record('alpha')])
    const store = new ComputerRecordStore(directory, {
      syncDirectory: async () => {
        throw new Error('directory sync failed')
      }
    })

    await expect(store.setDesiredState('alpha', 'running', noOpCommit())).rejects.toThrow(
      'directory sync failed'
    )
    await expect(new ComputerRecordStore(directory).get('alpha')).resolves.toMatchObject({
      desiredState: 'running'
    })
  })
})
