import { posix } from 'node:path'
import type { AgentReference } from '../../shared/agent-roster'
import { inspectMcpConfigContent, MCP_CONFIG_CANDIDATES } from '../../shared/mcp-config'
import { MCP_CONFIG_INSPECTION_MAX_BYTES } from '../../shared/mcp-config-inspection-limits'
import { discoverSkills, type SkillDiscoveryHost } from '../skills/discovery'
import type { AgentReferenceResolver } from './agent-execution-service'
import type { ManagedComputerHostProjector } from './managed-computer-host-projector'

const COMPUTER_HOME = '/home/ubuntu'

export function createComputerAgentReferenceResolver(options: {
  host: ManagedComputerHostProjector
}): AgentReferenceResolver {
  return async (launch) => {
    const connection = await options.host.connect(launch.computer.id)
    const discoveryHost: SkillDiscoveryHost = {
      filesystem: connection.filesystem,
      pathApi: posix,
      cacheNamespace: `${connection.executionHostId}:${launch.computerExecutionGeneration}`
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
        host: discoveryHost
      })
      for (const reference of skillReferences) {
        const expectedName = reference.name.toLowerCase()
        const found = discovery.skills.some(
          (skill) =>
            (skill.name.trim().toLowerCase() === expectedName ||
              posix.basename(skill.directoryPath).trim().toLowerCase() === expectedName) &&
            skillMatchesScope(skill.sourceKind, reference.scope)
        )
        if (!found) {
          throw new Error(`Computer is missing required skill: ${reference.name}`)
        }
      }
    }

    for (const reference of launch.agent.references.items) {
      if (reference.kind !== 'mcp-server') {
        continue
      }
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
      } catch {
        // Missing and unreadable requirements are both launch-blocking.
      }
      const inspection = inspectMcpConfigContent(candidate, content)
      const server = inspection.servers.find(({ name }) => name === reference.name)
      if (inspection.status !== 'valid' || server?.status !== 'enabled') {
        throw new Error(`Computer is missing required MCP server: ${reference.name}`)
      }
    }
  }
}

function skillMatchesScope(
  sourceKind: 'home' | 'repo' | 'bundled' | 'plugin',
  scope: 'global' | 'workspace' | 'either'
): boolean {
  if (scope === 'either') {
    return true
  }
  return scope === 'global'
    ? sourceKind === 'home' || sourceKind === 'bundled'
    : sourceKind === 'repo' || sourceKind === 'plugin'
}
