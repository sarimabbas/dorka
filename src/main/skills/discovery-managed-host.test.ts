import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearSkillRootScanCache, discoverSkills, type SkillDiscoveryHost } from './discovery'

const temporaryRoots: string[] = []

afterEach(async () => {
  clearSkillRootScanCache()
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })))
})

describe('managed-host skill discovery', () => {
  it('reads and filters skills through the Computer filesystem provider', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dorka-managed-skills-'))
    temporaryRoots.push(root)
    const home = join(root, 'home')
    const skillDirectory = join(home, '.agents', 'skills', 'review')
    await mkdir(skillDirectory, { recursive: true })
    await writeFile(
      join(skillDirectory, 'SKILL.md'),
      '---\nname: code-review\ndescription: Review changes\n---\n'
    )
    const calls: string[] = []
    const host: SkillDiscoveryHost = {
      cacheNamespace: 'computer-test',
      pathApi: posix,
      isNotFoundError: (error) => (error as NodeJS.ErrnoException | null)?.code === 'ENOENT',
      filesystem: {
        async readDir(path) {
          calls.push(`dir:${path}`)
          return (await readdir(path, { withFileTypes: true })).map((entry) => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isSymlink: entry.isSymbolicLink()
          }))
        },
        async readFile(path) {
          calls.push(`file:${path}`)
          return { content: await readFile(path, 'utf8'), isBinary: false }
        },
        realpath,
        async stat(path) {
          const value = await stat(path)
          return {
            size: value.size,
            type: value.isDirectory() ? 'directory' : 'file',
            mtime: value.mtimeMs,
            mtimeMs: value.mtimeMs
          }
        }
      }
    }

    const result = await discoverSkills({
      homeDir: home,
      cwd: '/workspace',
      includeCwd: false,
      names: ['code-review'],
      host
    })

    expect(result.skills.map((skill) => skill.name)).toEqual(['code-review'])
    expect(calls).toContain(`file:${join(skillDirectory, 'SKILL.md')}`)
  })
})
