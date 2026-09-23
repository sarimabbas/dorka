import { describe, expect, it, vi } from 'vitest'
import type {
  DorkaFirstRunAgentRoster,
  DorkaFirstRunComputerRuntime
} from '../dorka-bootstrap/dorka-first-run'
import type { DorkadControlPlaneHealth } from './dorkad-control-plane'
import { provisionDorkadFirstRun } from './dorkad-first-run'

function controlPlane(state: 'live' | 'degraded' = 'live') {
  const computers: DorkaFirstRunComputerRuntime = {
    list: vi.fn(async () => []),
    create: vi.fn(async (spec) => ({ id: spec.id, state: 'created' as const })),
    start: vi.fn(async () => undefined)
  }
  const agents: DorkaFirstRunAgentRoster = {
    listAgents: vi.fn(() => []),
    createAgent: vi.fn(async () => undefined)
  }
  const computerEngine =
    state === 'live'
      ? {
          state,
          cliPath: 'docker',
          reconciliation: { created: [], started: [], stopped: [], removed: [] }
        }
      : { state, cliPath: 'docker', reason: 'engine unavailable' }
  const health: DorkadControlPlaneHealth = {
    state,
    serverId: 'server-1',
    defaultComputerImage: 'dorka-computer:selkies',
    computerEngine
  }
  return { agents, computers, health }
}

describe('provisionDorkadFirstRun', () => {
  it('applies deployment defaults and environment overrides', async () => {
    const service = controlPlane()

    await expect(
      provisionDorkadFirstRun(service, {
        DORKA_DEFAULT_HARNESS: 'codex',
        DORKA_DEFAULT_AGENT_PROMPT: 'Review this repository.'
      })
    ).resolves.toEqual({
      state: 'provisioned',
      result: { computerCreated: true, computerStarted: true, agentCreated: true }
    })
    expect(service.computers.create).toHaveBeenCalledWith({
      id: 'main',
      displayName: 'Main',
      image: 'dorka-computer:selkies'
    })
    expect(service.agents.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ harnessId: 'codex', promptTemplate: 'Review this repository.' })
    )
  })

  it('skips provisioning when the container engine is unavailable', async () => {
    const service = controlPlane('degraded')

    await expect(provisionDorkadFirstRun(service)).resolves.toEqual({ state: 'skipped' })
    expect(service.computers.list).not.toHaveBeenCalled()
    expect(service.agents.listAgents).not.toHaveBeenCalled()
  })

  it('reports a degraded bootstrap without preventing dorkad startup', async () => {
    const service = controlPlane()
    vi.mocked(service.computers.create).mockRejectedValue(new Error('image not found'))

    await expect(provisionDorkadFirstRun(service)).resolves.toEqual({
      state: 'degraded',
      reason: 'image not found'
    })
  })
})
