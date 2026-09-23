import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SkillDiscoveryHost } from './skill-root-file-walk'
import { readSkillSummary, skillPathExists } from './skill-discovery-filesystem'

function host(failure: Error): SkillDiscoveryHost {
  return {
    cacheNamespace: 'test',
    pathApi: posix,
    isNotFoundError: (error) => (error as NodeJS.ErrnoException | null)?.code === 'ENOENT',
    filesystem: {
      async readDir() {
        throw failure
      },
      async readFile() {
        throw failure
      },
      async realpath() {
        throw failure
      },
      async stat() {
        throw failure
      }
    }
  }
}

describe('skill discovery filesystem', () => {
  it('treats only classified absence as missing', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    await expect(skillPathExists('/missing', host(missing))).resolves.toBe(false)
    await expect(readSkillSummary('/missing/SKILL.md', host(missing))).resolves.toBeNull()
  })

  it('propagates managed-host transport failures', async () => {
    const disconnected = new Error('SSH relay disconnected')
    await expect(skillPathExists('/unknown', host(disconnected))).rejects.toThrow(disconnected)
    await expect(readSkillSummary('/unknown/SKILL.md', host(disconnected))).rejects.toThrow(
      disconnected
    )
  })
})
