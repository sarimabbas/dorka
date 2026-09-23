import {
  ensureDorkaFirstRun,
  type DorkaFirstRunAgentRoster,
  type DorkaFirstRunComputerRuntime,
  type DorkaFirstRunResult
} from '../dorka-bootstrap/dorka-first-run'
import type { DorkadControlPlaneHealth } from './dorkad-control-plane'

const DEFAULT_AGENT_PROMPT =
  'You are a persistent Dorka Agent working through the terminal in this Computer. Ask what work to take over, then execute carefully and report progress.'

export type DorkadFirstRunProvisioning =
  | { state: 'provisioned'; result: DorkaFirstRunResult }
  | { state: 'skipped' }
  | { state: 'degraded'; reason: string }

type DorkadFirstRunControlPlane = {
  agents: DorkaFirstRunAgentRoster
  computers: DorkaFirstRunComputerRuntime
  health: DorkadControlPlaneHealth
}

export async function provisionDorkadFirstRun(
  controlPlane: DorkadFirstRunControlPlane,
  env: NodeJS.ProcessEnv = process.env
): Promise<DorkadFirstRunProvisioning> {
  if (controlPlane.health.computerEngine.state !== 'live') {
    return { state: 'skipped' }
  }

  try {
    const result = await ensureDorkaFirstRun({
      computers: controlPlane.computers,
      agents: controlPlane.agents,
      defaultComputer: { image: controlPlane.health.defaultComputerImage },
      defaultHarnessId: env.DORKA_DEFAULT_HARNESS ?? 'pi',
      defaultPromptTemplate: env.DORKA_DEFAULT_AGENT_PROMPT ?? DEFAULT_AGENT_PROMPT,
      startComputer: true
    })
    return { state: 'provisioned', result }
  } catch (error) {
    return { state: 'degraded', reason: error instanceof Error ? error.message : String(error) }
  }
}
