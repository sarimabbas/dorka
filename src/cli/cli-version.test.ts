import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readDorkaCliVersion } from './cli-version'

const temporaryDirectories: string[] = []

afterEach(() =>
  Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
)

describe('CLI version', () => {
  it('reads the package boundary beside the compiled CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dorka-cli-version-'))
    const runtimeDir = join(root, 'cli')
    temporaryDirectories.push(root)
    await mkdir(runtimeDir)
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.4.178-rc.2' }))

    expect(readDorkaCliVersion(runtimeDir)).toBe('1.4.178-rc.2')
  })

  it('rejects missing, malformed, and non-string versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dorka-cli-version-invalid-'))
    const runtimeDir = join(root, 'cli')
    temporaryDirectories.push(root)
    await mkdir(runtimeDir)

    expect(readDorkaCliVersion(runtimeDir)).toBeNull()
    await writeFile(join(root, 'package.json'), '{')
    expect(readDorkaCliVersion(runtimeDir)).toBeNull()
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: 178 }))
    expect(readDorkaCliVersion(runtimeDir)).toBeNull()
  })
})
