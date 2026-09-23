import { posix } from 'node:path'
import type { AgentReference } from '../../shared/agent-roster'
import { inspectMcpConfigContent, MCP_CONFIG_CANDIDATES } from '../../shared/mcp-config'
import { MCP_CONFIG_INSPECTION_MAX_BYTES } from '../../shared/mcp-config-inspection-limits'
import type { DiscoveredSkill, SkillDiscoverySource, SkillSourceKind } from '../../shared/skills'
import { discoverSkills, type SkillDiscoveryHost } from '../skills/discovery'
import type { AgentReferenceResolver } from './agent-execution-service'
import type { ManagedComputerHostProjector } from './managed-computer-host-projector'

const COMPUTER_HOME = '/home/ubuntu'

export function createComputerAgentReferenceResolver(options: {
  host: ManagedComputerHostProjector
}): AgentReferenceResolver {
  return async (launch) => {
    const connection = await options.host.connect(launch.computer.id)
    if (connection.durableExitEvidence?.generation !== launch.computerExecutionGeneration) {
      throw new Error('Computer relay execution generation is unverifiable')
    }
    const discoveryHost: SkillDiscoveryHost = {
      filesystem: connection.filesystem,
      pathApi: posix,
      cacheNamespace: `${connection.executionHostId}:${launch.computerExecutionGeneration}`,
      isNotFoundError: isRemoteNotFoundError
    }
    const skillReferences = launch.agent.references.items.filter(
      (reference): reference is Extract<AgentReference, { kind: 'skill' }> =>
        reference.kind === 'skill'
    )
    if (skillReferences.length > 0) {
      const discovery = await discoverSkills({
        homeDir: COMPUTER_HOME,
        cwd: launch.sourceDirectory,
        names: skillReferences.map((reference) => reference.name),
        sourceKinds: requestedSkillSourceKinds(skillReferences),
        host: discoveryHost
      })
      for (const reference of skillReferences) {
        const expectedName = reference.name.toLowerCase()
        const found = discovery.skills.some(
          (skill) =>
            (skill.name.trim().toLowerCase() === expectedName ||
              posix.basename(skill.directoryPath).trim().toLowerCase() === expectedName) &&
            skillMatchesScope(skill, discovery.sources, reference.scope)
        )
        if (!found) {
          throw new Error(`Computer is missing required skill: ${reference.name}`)
        }
      }
    }

    const inspections = new Map<string, ReturnType<typeof inspectMcpConfigContent>>()
    for (const reference of launch.agent.references.items) {
      if (reference.kind !== 'mcp-server') {
        continue
      }
      let inspection = inspections.get(reference.configId)
      if (!inspection) {
        const candidate = MCP_CONFIG_CANDIDATES.find(({ id }) => id === reference.configId)
        if (!candidate) {
          throw new Error(`Unsupported MCP configuration: ${reference.configId}`)
        }
        let content: string | null = null
        try {
          const file = await connection.filesystem.readFile(
            posix.join(launch.sourceDirectory, candidate.relativePath),
            { maxTextBytes: MCP_CONFIG_INSPECTION_MAX_BYTES }
          )
          content = file.isBinary ? '' : file.content
        } catch (error) {
          if (!isRemoteNotFoundError(error)) {
            throw error
          }
        }
        inspection = inspectMcpConfigContent(candidate, content)
        inspections.set(reference.configId, inspection)
      }
      const server = inspection.servers.find(({ name }) => name === reference.name)
      if (inspection.status !== 'valid' || server?.status !== 'enabled') {
        throw new Error(`Computer is missing required MCP server: ${reference.name}`)
      }
    }
  }
}

function isRemoteNotFoundError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return true
  }
  return (
    error instanceof Error && /(?:ENOENT|ENOTDIR|no such file or directory)/i.test(error.message)
  )
}

function requestedSkillSourceKinds(
  references: readonly Extract<AgentReference, { kind: 'skill' }>[]
): SkillSourceKind[] {
  const kinds = new Set<SkillSourceKind>()
  for (const reference of references) {
    if (reference.scope !== 'workspace') {
      kinds.add('home')
      kinds.add('bundled')
    }
    if (reference.scope !== 'global') {
      kinds.add('repo')
    }
  }
  return [...kinds]
}

function skillMatchesScope(
  skill: DiscoveredSkill,
  sources: readonly SkillDiscoverySource[],
  scope: 'global' | 'workspace' | 'either'
): boolean {
  const rootPaths = new Set(skill.rootPaths ?? [skill.rootPath])
  return sources.some(
    (source) =>
      source.skippedReason !== 'unavailable' &&
      rootPaths.has(source.path) &&
      (scope === 'either'
        ? source.sourceKind === 'home' || source.sourceKind === 'repo'
        : scope === 'global'
          ? source.sourceKind === 'home'
          : source.sourceKind === 'repo')
  )
}
