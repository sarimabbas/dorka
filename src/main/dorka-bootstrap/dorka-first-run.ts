import type { AgentCreate } from '../../shared/agent-roster'
import type { ComputerCreateSpec, ComputerRuntimeState } from '../../shared/computer-runtime'

export const DORKA_MAIN_COMPUTER_ID = 'main'
export const DORKA_MAIN_COMPUTER_DISPLAY_NAME = 'Main'

export type DorkaFirstRunComputerRuntime = {
  list(): Promise<readonly { id: string; state: ComputerRuntimeState }[]>
  create(
    spec: ComputerCreateSpec & { displayName: string }
  ): Promise<{ id: string; state: ComputerRuntimeState }>
  start(id: string): Promise<unknown>
}

export type DorkaFirstRunAgentRoster = {
  listAgents(): readonly { id: string }[]
  createAgent(input: AgentCreate): Promise<unknown>
}

export type DorkaFirstRunOptions = {
  computers: DorkaFirstRunComputerRuntime
  agents: DorkaFirstRunAgentRoster
  defaultComputer: Omit<ComputerCreateSpec, 'id'>
  defaultHarnessId: string
  defaultPromptTemplate: string
  startComputer?: boolean
}

export type DorkaFirstRunResult = {
  computerCreated: boolean
  computerStarted: boolean
  agentCreated: boolean
}

const INITIAL_AGENT: Omit<AgentCreate, 'harnessId' | 'promptTemplate'> = {
  name: 'Assistant',
  character: { color: 'violet', variant: 'orb' },
  job: 'Help with work on this Computer'
}

export async function ensureDorkaFirstRun(
  options: DorkaFirstRunOptions
): Promise<DorkaFirstRunResult> {
  const computers = await options.computers.list()
  const mainComputer = computers.find((computer) => computer.id === DORKA_MAIN_COMPUTER_ID)
  const computerCreated = mainComputer === undefined

  if (computerCreated) {
    await options.computers.create({
      ...options.defaultComputer,
      id: DORKA_MAIN_COMPUTER_ID,
      displayName: DORKA_MAIN_COMPUTER_DISPLAY_NAME
    })
  }

  const computerStarted =
    options.startComputer === true && (computerCreated || mainComputer?.state === 'created')
  if (computerStarted) {
    await options.computers.start(DORKA_MAIN_COMPUTER_ID)
  }

  const agentCreated = options.agents.listAgents().length === 0
  if (agentCreated) {
    await options.agents.createAgent({
      ...INITIAL_AGENT,
      harnessId: options.defaultHarnessId,
      promptTemplate: options.defaultPromptTemplate
    })
  }

  return { computerCreated, computerStarted, agentCreated }
}
