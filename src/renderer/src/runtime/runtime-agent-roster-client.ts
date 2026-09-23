import type { Agent, AgentCreate } from '../../../shared/agent-roster'
import { AGENT_ROSTER_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import { ensureLocalRuntimeCapabilities } from './local-runtime-capabilities'
import {
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability,
  type RuntimeClientTarget
} from './runtime-rpc-client'

export class AgentRosterUnsupportedError extends Error {
  constructor() {
    super('Agent presets require a newer Dorka runtime.')
    this.name = 'AgentRosterUnsupportedError'
  }
}

async function assertAgentRosterSupported(target: RuntimeClientTarget): Promise<void> {
  const capabilities = target.kind === 'local' ? await ensureLocalRuntimeCapabilities() : null
  const supported =
    target.kind === 'local'
      ? capabilities?.includes(AGENT_ROSTER_RUNTIME_CAPABILITY)
      : await runtimeEnvironmentSupportsCapability(
          target.environmentId,
          AGENT_ROSTER_RUNTIME_CAPABILITY
        )

  if (supported === false) {
    throw new AgentRosterUnsupportedError()
  }
  if (supported == null) {
    throw new Error('Could not verify agent preset support.')
  }
}

export async function listRuntimeAgentPresets(target: RuntimeClientTarget): Promise<Agent[]> {
  await assertAgentRosterSupported(target)
  return callRuntimeRpc<Agent[]>(target, 'agents.list', {})
}

export async function createRuntimeAgentPreset(
  target: RuntimeClientTarget,
  preset: AgentCreate
): Promise<Agent> {
  await assertAgentRosterSupported(target)
  return callRuntimeRpc<Agent>(target, 'agents.create', preset)
}
