import { open, stat } from 'node:fs/promises'
import { summarizeSkillMarkdown } from '../../shared/skill-metadata'
import type { SkillDiscoveryHost } from './skill-root-file-walk'

const MAX_MARKDOWN_BYTES = 256 * 1024

export async function skillPathExists(
  pathValue: string,
  host?: SkillDiscoveryHost
): Promise<boolean> {
  try {
    await (host ? host.filesystem.stat(pathValue) : stat(pathValue))
    return true
  } catch (error) {
    if (!host || host.isNotFoundError(error)) {
      return false
    }
    throw error
  }
}

export async function readSkillSummary(
  skillFilePath: string,
  host?: SkillDiscoveryHost
): Promise<{
  name: string | null
  description: string | null
  updatedAt: number | null
} | null> {
  try {
    if (host) {
      const [fileStat, file] = await Promise.all([
        host.filesystem.stat(skillFilePath),
        host.filesystem.readFile(skillFilePath, { maxTextBytes: MAX_MARKDOWN_BYTES })
      ])
      if (file.isBinary) {
        return null
      }
      return {
        ...summarizeSkillMarkdown(file.content),
        updatedAt: fileStat.mtimeMs ?? fileStat.mtime
      }
    }
    const fileStat = await stat(skillFilePath)
    const file = await open(skillFilePath, 'r')
    let content = ''
    try {
      const buffer = Buffer.alloc(Math.min(fileStat.size, MAX_MARKDOWN_BYTES))
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      content = buffer.toString('utf8', 0, bytesRead)
    } finally {
      await file.close()
    }
    return { ...summarizeSkillMarkdown(content), updatedAt: fileStat.mtimeMs }
  } catch (error) {
    if (!host || host.isNotFoundError(error)) {
      return null
    }
    throw error
  }
}
