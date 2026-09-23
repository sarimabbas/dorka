import type { Agent, AgentCreate, AgentUpdateResult, Run } from '../../../shared/agent-roster'
import type { ComputerRuntimeInfo } from '../../../shared/computer-runtime'
import {
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  AGENT_REFERENCES_RUNTIME_CAPABILITY,
  AGENT_ROSTER_RUNTIME_CAPABILITY,
  AGENT_RUN_HISTORY_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '../../../shared/protocol-version'
import type {
  ListRunsRequest,
  RunAgentRequest,
  UpdateAgentReferencesRequest
} from '../../../shared/rpc-contract/agent-roster-params'
import { ensureLocalRuntimeCapabilities } from './local-runtime-capabilities'
import {
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability,
  type RuntimeClientTarget
} from './runtime-rpc-client'

export class AgentRosterUnsupportedError extends Error {
  constructor() {
    super('Agents require a newer Dorka runtime.')
    this.name = 'AgentRosterUnsupportedError'
  }
}

export class AgentExecutionUnsupportedError extends Error {
  constructor() {
    super('Launching Agents requires a newer Dorka runtime.')
    this.name = 'AgentExecutionUnsupportedError'
  }
}

export class AgentRunHistoryUnsupportedError extends Error {
  constructor() {
    super('Run history requires a newer Dorka runtime.')
    this.name = 'AgentRunHistoryUnsupportedError'
  }
}

async function supportsCapability(
  target: RuntimeClientTarget,
  capability: RuntimeCapability
): Promise<boolean | null> {
  if (target.kind === 'environment') {
    return runtimeEnvironmentSupportsCapability(target.environmentId, capability)
  }
  return (await ensureLocalRuntimeCapabilities())?.includes(capability) ?? null
}

async function assertCapability(
  target: RuntimeClientTarget,
  capability: RuntimeCapability,
  UnsupportedError:
    | typeof AgentRosterUnsupportedError
    | typeof AgentExecutionUnsupportedError
    | typeof AgentRunHistoryUnsupportedError,
  verificationMessage: string
): Promise<void> {
  const supported = await supportsCapability(target, capability)
  if (supported === false) {
    throw new UnsupportedError()
  }
  if (supported == null) {
    throw new Error(verificationMessage)
  }
}

async function assertAgentRosterSupported(target: RuntimeClientTarget): Promise<void> {
  await assertCapability(
    target,
    AGENT_ROSTER_RUNTIME_CAPABILITY,
    AgentRosterUnsupportedError,
    'Could not verify agent preset support.'
  )
}

async function assertAgentExecutionSupported(target: RuntimeClientTarget): Promise<void> {
  await assertCapability(
    target,
    AGENT_EXECUTION_RUNTIME_CAPABILITY,
    AgentExecutionUnsupportedError,
    'Could not verify agent preset launch support.'
  )
}

export async function listRuntimeAgentPresets(target: RuntimeClientTarget): Promise<Agent[]> {
  await assertAgentRosterSupported(target)
  return callRuntimeRpc<Agent[]>(target, 'agents.list', {})
}

export async function listRuntimeAgentRuns(
  target: RuntimeClientTarget,
  filter: ListRunsRequest = {}
): Promise<Run[]> {
  await assertCapability(
    target,
    AGENT_RUN_HISTORY_RUNTIME_CAPABILITY,
    AgentRunHistoryUnsupportedError,
    'Could not verify Run history support.'
  )
  return callRuntimeRpc<Run[]>(target, 'agents.runs.list', filter)
}

export type AgentReferencesCapability = 'supported' | 'unsupported' | 'unverifiable'

export async function getRuntimeAgentReferencesCapability(
  target: RuntimeClientTarget
): Promise<AgentReferencesCapability> {
  try {
    const supported = await supportsCapability(target, AGENT_REFERENCES_RUNTIME_CAPABILITY)
    return supported === null ? 'unverifiable' : supported ? 'supported' : 'unsupported'
  } catch {
    return 'unverifiable'
  }
}

export async function updateRuntimeAgentReferences(
  target: RuntimeClientTarget,
  request: UpdateAgentReferencesRequest
): Promise<AgentUpdateResult> {
  const supported = await supportsCapability(target, AGENT_REFERENCES_RUNTIME_CAPABILITY)
  if (supported === false) {
    throw new Error('Agent requirements require a newer Dorka runtime.')
  }
  if (supported === null) {
    throw new Error('Could not verify Agent requirements support.')
  }
  return callRuntimeRpc<AgentUpdateResult>(target, 'agents.references.update', request)
}

export async function createRuntimeAgentPreset(
  target: RuntimeClientTarget,
  preset: AgentCreate
): Promise<Agent> {
  await assertAgentRosterSupported(target)
  return callRuntimeRpc<Agent>(target, 'agents.create', preset)
}

export async function listRuntimeAgentComputers(
  target: RuntimeClientTarget
): Promise<ComputerRuntimeInfo[]> {
  await assertAgentExecutionSupported(target)
  await assertCapability(
    target,
    COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY,
    AgentExecutionUnsupportedError,
    'Could not verify Computer support.'
  )
  return callRuntimeRpc<ComputerRuntimeInfo[]>(target, 'computers.list', {})
}

export async function runRuntimeAgentPreset(
  target: RuntimeClientTarget,
  request: RunAgentRequest
): Promise<Run> {
  await assertAgentExecutionSupported(target)
  return callRuntimeRpc<Run>(target, 'agents.run', request)
}
