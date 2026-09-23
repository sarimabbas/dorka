import { ensureDorkaFirstRun } from '../dorka-bootstrap/dorka-first-run'
import type { DorkadControlPlaneService } from './dorkad-control-plane'

const DEFAULT_AGENT_PROMPT =
  'You are a persistent Dorka Agent working through the terminal in this Computer. Ask what work to take over, then execute carefully and report progress.'

export async function provisionDorkadFirstRun(
  controlPlane: DorkadControlPlaneService,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (controlPlane.health.computerEngine.state !== 'live') {
    return
  }

  await ensureDorkaFirstRun({
    computers: controlPlane.computers,
    agents: controlPlane.agents,
    defaultComputer: { image: controlPlane.health.defaultComputerImage },
    defaultHarnessId: env.DORKA_DEFAULT_HARNESS ?? 'pi',
    defaultPromptTemplate: env.DORKA_DEFAULT_AGENT_PROMPT ?? DEFAULT_AGENT_PROMPT,
    startComputer: true
  })
}
