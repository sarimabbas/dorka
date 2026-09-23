import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentCreate, Run } from '../../../shared/agent-roster'
import {
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  AGENT_REFERENCES_RUNTIME_CAPABILITY,
  AGENT_ROSTER_RUNTIME_CAPABILITY,
  AGENT_RUN_HISTORY_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY
} from '../../../shared/protocol-version'
import { ensureLocalRuntimeCapabilities } from './local-runtime-capabilities'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import {
  AgentExecutionUnsupportedError,
  AgentRosterUnsupportedError,
  AgentRunHistoryUnsupportedError,
  createRuntimeAgentPreset,
  getRuntimeAgentReferencesCapability,
  listRuntimeAgentComputers,
  listRuntimeAgentPresets,
  listRuntimeAgentRuns,
  runRuntimeAgentPreset,
  updateRuntimeAgentReferences
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

  it('capability-gates filtered Run history and sends only agentId', async () => {
    localCapabilities.mockResolvedValue([AGENT_RUN_HISTORY_RUNTIME_CAPABILITY])
    rpc.mockResolvedValue([])

    await expect(listRuntimeAgentRuns({ kind: 'local' }, { agentId: 'agent-1' })).resolves.toEqual(
      []
    )

    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'agents.runs.list', {
      agentId: 'agent-1'
    })
  })

  it('does not call a runtime without Run history capability', async () => {
    supportsCapability.mockResolvedValue(false)

    await expect(
      listRuntimeAgentRuns({ kind: 'environment', environmentId: 'old-host' })
    ).rejects.toBeInstanceOf(AgentRunHistoryUnsupportedError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not call an unsupported runtime', async () => {
    supportsCapability.mockResolvedValue(false)

    await expect(
      listRuntimeAgentPresets({ kind: 'environment', environmentId: 'old-host' })
    ).rejects.toBeInstanceOf(AgentRosterUnsupportedError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('distinguishes supported, unsupported, and unverifiable Agent references', async () => {
    supportsCapability
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('Host unavailable'))

    await expect(
      getRuntimeAgentReferencesCapability({ kind: 'environment', environmentId: 'host-1' })
    ).resolves.toBe('supported')
    await expect(
      getRuntimeAgentReferencesCapability({ kind: 'environment', environmentId: 'old-host' })
    ).resolves.toBe('unsupported')
    await expect(
      getRuntimeAgentReferencesCapability({ kind: 'environment', environmentId: 'offline-host' })
    ).resolves.toBe('unverifiable')
  })

  it('does not describe unverifiable references updates as unsupported', async () => {
    const request = {
      agentId: 'agent-1',
      expectedRevision: 1,
      references: { version: 1 as const, items: [] }
    }
    localCapabilities.mockResolvedValue(null)
    supportsCapability.mockRejectedValue(new Error('Host unavailable'))

    await expect(updateRuntimeAgentReferences({ kind: 'local' }, request)).rejects.toThrow(
      'Could not verify Agent requirements support.'
    )
    await expect(
      updateRuntimeAgentReferences({ kind: 'environment', environmentId: 'offline-host' }, request)
    ).rejects.toThrow('Host unavailable')

    expect(supportsCapability).toHaveBeenCalledWith(
      'offline-host',
      AGENT_REFERENCES_RUNTIME_CAPABILITY
    )
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
