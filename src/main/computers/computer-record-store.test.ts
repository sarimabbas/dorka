import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ComputerRecordStore } from './computer-record-store'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('ComputerRecordStore', () => {
  it('serializes concurrent legacy migration around one persisted generation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dorka-computer-records-'))
    directories.push(directory)
    const path = join(directory, 'computers.json')
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        computers: [{ spec: { id: 'alpha', image: 'safe/image:tag' }, desiredState: 'running' }]
      })
    )
    const store = new ComputerRecordStore(directory)

    const [first, second] = await Promise.all([store.load(), store.load()])
    const persisted = JSON.parse(await readFile(path, 'utf8'))

    expect(first[0]?.executionGeneration).toMatch(/^[0-9a-f-]{36}$/)
    expect(second[0]?.executionGeneration).toBe(first[0]?.executionGeneration)
    expect(persisted.computers[0].executionGeneration).toBe(first[0]?.executionGeneration)
  })
})
