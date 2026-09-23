import { readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { DirEntry } from '../../shared/filesystem-entry-types'
import type { IFilesystemProvider } from '../providers/types'
import { isSkillStagingEntryName } from './skill-delete/staging-names'

export const SKILL_FILE_NAME = 'SKILL.md'

export type SkillDiscoveryFilesystem = Pick<IFilesystemProvider, 'readDir' | 'realpath' | 'stat'>
export type SkillDiscoveryPathApi = {
  isAbsolute(path: string): boolean
  join(...paths: string[]): string
  relative(from: string, to: string): string
  sep: string
}
export type SkillDiscoveryHost = {
  filesystem: SkillDiscoveryFilesystem & Pick<IFilesystemProvider, 'readFile'>
  cacheNamespace: string
  pathApi: SkillDiscoveryPathApi & {
    basename(path: string): string
    dirname(path: string): string
  }
}

function isWithinDepth(
  rootPath: string,
  childPath: string,
  maxDepth: number,
  pathApi: SkillDiscoveryPathApi
): boolean {
  const rel = pathApi.relative(rootPath, childPath)
  if (!rel) {
    return true
  }
  if (rel === '..' || rel.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(rel)) {
    return false
  }
  return rel.split(pathApi.sep).length <= maxDepth
}

/** Walk a skill root through the filesystem authority that owns its paths. */
export async function findSkillFilesWithFilesystem(
  rootPath: string,
  maxDepth: number,
  filesystem: SkillDiscoveryFilesystem,
  pathApi: SkillDiscoveryPathApi,
  signal?: AbortSignal
): Promise<string[]> {
  const out: string[] = []
  const visitedDirectoryPaths = new Set<string>()
  async function visit(dirPath: string): Promise<void> {
    signal?.throwIfAborted()
    let resolvedDirPath: string
    try {
      resolvedDirPath = await filesystem.realpath(dirPath)
    } catch {
      return
    }
    if (visitedDirectoryPaths.has(resolvedDirPath)) {
      return
    }
    visitedDirectoryPaths.add(resolvedDirPath)

    let entries: DirEntry[]
    try {
      entries = await filesystem.readDir(dirPath)
    } catch {
      return
    }
    let childrenWithinDepth: boolean | undefined
    for (const entry of entries) {
      signal?.throwIfAborted()
      if (isSkillStagingEntryName(entry.name)) {
        continue
      }
      const entryPath = pathApi.join(dirPath, entry.name)
      if (entry.name === SKILL_FILE_NAME) {
        if (!entry.isDirectory && !entry.isSymlink) {
          out.push(entryPath)
          continue
        }
        if (entry.isSymlink) {
          try {
            if ((await filesystem.stat(entryPath)).type === 'file') {
              out.push(entryPath)
            }
          } catch {
            // Broken links are not valid skill files.
          }
        }
        continue
      }
      if (entry.isDirectory) {
        if ((childrenWithinDepth ??= isWithinDepth(rootPath, entryPath, maxDepth, pathApi))) {
          await visit(entryPath)
        }
        continue
      }
      if (
        entry.isSymlink &&
        (childrenWithinDepth ??= isWithinDepth(rootPath, entryPath, maxDepth, pathApi))
      ) {
        let linksToDirectory = false
        try {
          linksToDirectory = (await filesystem.stat(entryPath)).type === 'directory'
        } catch {
          // Broken links are not valid skill directories.
        }
        if (linksToDirectory) {
          await visit(entryPath)
        }
      }
    }
  }
  await visit(rootPath)
  return out
}

/** Native compatibility wrapper. */
export function findSkillFiles(
  rootPath: string,
  maxDepth: number,
  signal?: AbortSignal
): Promise<string[]> {
  return findSkillFilesWithFilesystem(
    rootPath,
    maxDepth,
    {
      async readDir(dirPath) {
        return (await readdir(dirPath, { withFileTypes: true })).map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isSymlink: entry.isSymbolicLink()
        }))
      },
      realpath,
      async stat(filePath) {
        const value = await stat(filePath)
        return {
          size: value.size,
          type: value.isDirectory() ? 'directory' : value.isSymbolicLink() ? 'symlink' : 'file',
          mtime: value.mtimeMs,
          mtimeMs: value.mtimeMs
        }
      }
    },
    { isAbsolute, join, relative, sep },
    signal
  )
}
