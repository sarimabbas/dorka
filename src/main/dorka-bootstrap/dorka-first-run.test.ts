import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import type { AgentCreate } from '../../shared/agent-roster'
import type { ComputerRuntimeState } from '../../shared/computer-runtime'
import {
  ensureDorkaFirstRun,
  type DorkaFirstRunAgentRoster,
  type DorkaFirstRunComputerRuntime
} from './dorka-first-run'

type Computer = { id: string; state: ComputerRuntimeState }

function harness(initial: { computers?: Computer[]; agentCount?: number } = {}) {
  const computers = [...(initial.computers ?? [])]
  const agents = Array.from({ length: initial.agentCount ?? 0 }, (_, index) => ({
    id: `agent-${String(index)}`
  }))
  const runtime: DorkaFirstRunComputerRuntime = {
    list: vi.fn(async () => computers),
    create: vi.fn(async (spec) => {
      const computer: Computer = { id: spec.id, state: 'created' }
      computers.push(computer)
      return computer
    }),
    start: vi.fn(async () => undefined)
  }
  const roster: DorkaFirstRunAgentRoster = {
    listAgents: vi.fn(() => agents),
    createAgent: vi.fn(async (input: AgentCreate) => {
      agents.push({ id: 'initial-agent' })
      return input
    })
  }
  return { computers, agents, runtime, roster }
}

function provision(
  runtime: DorkaFirstRunComputerRuntime,
  roster: DorkaFirstRunAgentRoster,
  startComputer = true
) {
  return ensureDorkaFirstRun({
    computers: runtime,
    agents: roster,
    defaultComputer: {
      image: 'ghcr.io/dorka/computer:1.0',
      resources: { cpus: 4, memoryMb: 8192 }
    },
    defaultHarnessId: 'codex',
    defaultPromptTemplate: 'Help the user from the terminal.',
    startComputer
  })
}

expectTypeOf<AgentRosterStore>().toMatchTypeOf<DorkaFirstRunAgentRoster>()
expectTypeOf<ComputerRuntimeManager>().toMatchTypeOf<DorkaFirstRunComputerRuntime>()

describe('ensureDorkaFirstRun', () => {
  it('provisions and starts the default Computer and initial Agent from empty state', async () => {
    const { runtime, roster } = harness()

    await expect(provision(runtime, roster)).resolves.toEqual({
      computerCreated: true,
      computerStarted: true,
      agentCreated: true
    })
    expect(runtime.create).toHaveBeenCalledWith({
      id: 'main',
      displayName: 'Main',
      image: 'ghcr.io/dorka/computer:1.0',
      resources: { cpus: 4, memoryMb: 8192 }
    })
    expect(runtime.start).toHaveBeenCalledWith('main')
    expect(roster.createAgent).toHaveBeenCalledWith({
      name: 'Assistant',
      character: { color: 'violet', variant: 'orb' },
      job: 'Help with work on this Computer',
      harnessId: 'codex',
      promptTemplate: 'Help the user from the terminal.'
    })
  })

  it('fills either missing half of partially provisioned state without changing the other', async () => {
    const missingAgent = harness({ computers: [{ id: 'main', state: 'stopped' }] })
    await expect(provision(missingAgent.runtime, missingAgent.roster)).resolves.toEqual({
      computerCreated: false,
      computerStarted: false,
      agentCreated: true
    })
    expect(missingAgent.runtime.create).not.toHaveBeenCalled()
    expect(missingAgent.runtime.start).not.toHaveBeenCalled()

    const missingComputer = harness({ agentCount: 1 })
    await expect(
      provision(missingComputer.runtime, missingComputer.roster, false)
    ).resolves.toEqual({
      computerCreated: true,
      computerStarted: false,
      agentCreated: false
    })
    expect(missingComputer.roster.createAgent).not.toHaveBeenCalled()
  })

  it('does nothing when provisioning is complete, preserving user changes', async () => {
    const { runtime, roster } = harness({
      computers: [{ id: 'main', state: 'stopped' }],
      agentCount: 1
    })

    await expect(provision(runtime, roster)).resolves.toEqual({
      computerCreated: false,
      computerStarted: false,
      agentCreated: false
    })
    expect(runtime.create).not.toHaveBeenCalled()
    expect(runtime.start).not.toHaveBeenCalled()
    expect(roster.createAgent).not.toHaveBeenCalled()
  })

  it('retries after Agent persistence fails without duplicating the created Computer', async () => {
    const { computers, agents, runtime, roster } = harness()
    vi.mocked(roster.createAgent)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockImplementationOnce(async (input) => {
        agents.push({ id: 'initial-agent' })
        return input
      })

    await expect(provision(runtime, roster, false)).rejects.toThrow('disk full')
    await expect(provision(runtime, roster, false)).resolves.toEqual({
      computerCreated: false,
      computerStarted: false,
      agentCreated: true
    })

    expect(computers).toEqual([{ id: 'main', state: 'created' }])
    expect(runtime.create).toHaveBeenCalledTimes(1)
    expect(roster.createAgent).toHaveBeenCalledTimes(2)
  })
})
