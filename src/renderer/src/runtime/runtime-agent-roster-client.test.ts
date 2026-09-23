import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentCreate, Run } from '../../../shared/agent-roster'
import {
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  AGENT_ROSTER_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY
} from '../../../shared/protocol-version'
import { ensureLocalRuntimeCapabilities } from './local-runtime-capabilities'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import {
  AgentExecutionUnsupportedError,
  AgentRosterUnsupportedError,
  createRuntimeAgentPreset,
  listRuntimeAgentComputers,
  listRuntimeAgentPresets,
  runRuntimeAgentPreset
} from './runtime-agent-roster-client'

vi.mock('./local-runtime-capabilities', () => ({ ensureLocalRuntimeCapabilities: vi.fn() }))
vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

const localCapabilities = vi.mocked(ensureLocalRuntimeCapabilities)
const supportsCapability = vi.mocked(runtimeEnvironmentSupportsCapability)
const rpc = vi.mocked(callRuntimeRpc)

describe('runtime agent roster client', () => {
  beforeEach(() => {
    localCapabilities.mockReset()
    supportsCapability.mockReset()
    rpc.mockReset()
  })

  it('lists through the local runtime with the strict empty request', async () => {
    localCapabilities.mockResolvedValue([AGENT_ROSTER_RUNTIME_CAPABILITY])
    rpc.mockResolvedValue([])

    await expect(listRuntimeAgentPresets({ kind: 'local' })).resolves.toEqual([])

    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'agents.list', {})
  })

  it('does not call an unsupported runtime', async () => {
    supportsCapability.mockResolvedValue(false)

    await expect(
      listRuntimeAgentPresets({ kind: 'environment', environmentId: 'old-host' })
    ).rejects.toBeInstanceOf(AgentRosterUnsupportedError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('capability-gates Computer listing for launches', async () => {
    supportsCapability.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(
      listRuntimeAgentComputers({ kind: 'environment', environmentId: 'old-host' })
    ).rejects.toBeInstanceOf(AgentExecutionUnsupportedError)

    expect(supportsCapability).toHaveBeenNthCalledWith(
      1,
      'old-host',
      AGENT_EXECUTION_RUNTIME_CAPABILITY
    )
    expect(supportsCapability).toHaveBeenNthCalledWith(
      2,
      'old-host',
      COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY
    )
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lists Computers and runs a preset with only the strict launch fields', async () => {
    localCapabilities.mockResolvedValue([
      AGENT_EXECUTION_RUNTIME_CAPABILITY,
      COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY
    ])
    rpc.mockResolvedValueOnce([])
    await expect(listRuntimeAgentComputers({ kind: 'local' })).resolves.toEqual([])
    expect(rpc).toHaveBeenNthCalledWith(1, { kind: 'local' }, 'computers.list', {})

    const run: Run = {
      id: 'run-1',
      agentId: 'agent-1',
      computerId: 'computer-1',
      status: 'running',
      prompt: 'Preset\n\nReview this.',
      createdAt: 1,
      startedAt: 2
    }
    rpc.mockResolvedValueOnce(run)
    await expect(
      runRuntimeAgentPreset(
        { kind: 'local' },
        { agentId: 'agent-1', computerId: 'computer-1', prompt: 'Review this.' }
      )
    ).resolves.toBe(run)
    expect(rpc).toHaveBeenNthCalledWith(2, { kind: 'local' }, 'agents.run', {
      agentId: 'agent-1',
      computerId: 'computer-1',
      prompt: 'Review this.'
    })
  })

  it('sends only the agent create contract fields', async () => {
    const request: AgentCreate = {
      name: 'Reviewer',
      character: { color: 'violet', variant: 'orb' },
      job: 'Review releases',
      harnessId: 'codex',
      model: 'o3',
      promptTemplate: 'Review the current release.',
      workingDirectory: '/repo'
    }
    supportsCapability.mockResolvedValue(true)
    rpc.mockResolvedValue({ id: 'agent-1' })

    await createRuntimeAgentPreset({ kind: 'environment', environmentId: 'host-1' }, request)

    expect(supportsCapability).toHaveBeenCalledWith('host-1', AGENT_ROSTER_RUNTIME_CAPABILITY)
    expect(rpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'host-1' },
      'agents.create',
      request
    )
  })
})
