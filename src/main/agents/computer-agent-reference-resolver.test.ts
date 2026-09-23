import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Agent, AgentReference } from '../../shared/agent-roster'
import type { IFilesystemProvider } from '../providers/types'
import type { AgentTerminalLaunch } from './agent-execution-service'
import { createComputerAgentReferenceResolver } from './computer-agent-reference-resolver'
import type { ManagedComputerHostProjector } from './managed-computer-host-projector'

function filesystem(files: Record<string, string>): IFilesystemProvider {
  const directories = new Set<string>(['/'])
  for (const filePath of Object.keys(files)) {
    let directory = posix.dirname(filePath)
    while (!directories.has(directory)) {
      directories.add(directory)
      directory = posix.dirname(directory)
    }
  }
  return {
    async readDir(directory) {
      if (!directories.has(directory)) {
        throw new Error('ENOENT')
      }
      const entries = new Map<string, { name: string; isDirectory: boolean; isSymlink: boolean }>()
      for (const child of [...directories, ...Object.keys(files)]) {
        if (child !== directory && posix.dirname(child) === directory) {
          entries.set(posix.basename(child), {
            name: posix.basename(child),
            isDirectory: directories.has(child),
            isSymlink: false
          })
        }
      }
      return [...entries.values()]
    },
    async readFile(filePath) {
      const content = files[filePath]
      if (content === undefined) {
        throw new Error('ENOENT')
      }
      return { content, isBinary: false }
    },
    async realpath(filePath) {
      if (!directories.has(filePath) && files[filePath] === undefined) {
        throw new Error('ENOENT')
      }
      return filePath
    },
    async stat(filePath) {
      if (directories.has(filePath)) {
        return { size: 0, type: 'directory', mtime: 1 }
      }
      if (files[filePath] !== undefined) {
        return { size: files[filePath].length, type: 'file', mtime: 1 }
      }
      throw new Error('ENOENT')
    }
  } as IFilesystemProvider
}

function setup(references: AgentReference[], files: Record<string, string>) {
  const host: ManagedComputerHostProjector = {
    async connect() {
      return {
        connectionId: 'runtime-ssh-computer-main',
        executionHostId: 'ssh:runtime-ssh-computer-main',
        filesystem: filesystem(files),
        git: undefined
      }
    }
  }
  const agent: Agent = {
    id: 'agent-1',
    name: 'Builder',
    character: { color: 'blue', variant: 'default' },
    job: 'Build',
    harnessId: 'pi',
    promptTemplate: 'Build it',
    revision: 1,
    references: { version: 1, items: references },
    createdAt: 1,
    updatedAt: 1
  }
  const request: AgentTerminalLaunch = {
    runId: 'run-1',
    agent,
    computer: {
      id: 'main',
      name: 'Main',
      state: 'running',
      image: 'computer:latest'
    },
    computerExecutionGeneration: 'generation-1',
    prompt: 'Build it',
    sourceDirectory: '/workspace'
  }
  return { resolver: createComputerAgentReferenceResolver({ host }), request }
}

describe('Computer Agent reference resolver', () => {
  it('accepts Computer-local skills and enabled MCP servers', async () => {
    const { resolver, request } = setup(
      [
        { kind: 'skill', name: 'code-review', scope: 'global' },
        { kind: 'mcp-server', name: 'docs', configId: 'workspace' }
      ],
      {
        '/home/ubuntu/.agents/skills/review/SKILL.md':
          '---\nname: code-review\ndescription: Review code\n---\n',
        '/workspace/.mcp.json': JSON.stringify({
          mcpServers: { docs: { type: 'http', url: 'https://example.invalid' } }
        })
      }
    )

    await expect(resolver(request)).resolves.toBeUndefined()
  })

  it('rejects a global skill when the Agent requires workspace scope', async () => {
    const { resolver, request } = setup(
      [{ kind: 'skill', name: 'code-review', scope: 'workspace' }],
      {
        '/home/ubuntu/.agents/skills/review/SKILL.md':
          '---\nname: code-review\ndescription: Review code\n---\n'
      }
    )

    await expect(resolver(request)).rejects.toThrow(
      'Computer is missing required skill: code-review'
    )
  })
})
