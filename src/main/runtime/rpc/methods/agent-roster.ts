import { defineMethod } from '../core'
import {
  CreateAgentParams,
  ListAgentsParams,
  ListRunsParams,
  MoveAgentParams,
  RunAgentParams,
  UpdateAgentReferencesParams
} from '../../../../shared/rpc-contract/agent-roster-params'

export const AGENT_ROSTER_METHODS = [
  defineMethod({
    name: 'agents.list',
    params: ListAgentsParams,
    handler: async (_params, { runtime }) => runtime.listRosterAgents()
  }),
  defineMethod({
    name: 'agents.create',
    params: CreateAgentParams,
    handler: async (params, { runtime }) => runtime.createRosterAgent(params)
  }),
  defineMethod({
    name: 'agents.runs.list',
    params: ListRunsParams,
    handler: async (params, { runtime }) => runtime.listRosterRuns(params)
  }),
  defineMethod({
    name: 'agents.move',
    params: MoveAgentParams,
    handler: async (params, { runtime }) =>
      runtime.moveRosterAgent(params.agentId, params.computerId)
  }),
  defineMethod({
    name: 'agents.references.update',
    params: UpdateAgentReferencesParams,
    handler: async (params, { runtime }) =>
      runtime.updateRosterAgentReferences(
        params.agentId,
        params.expectedRevision,
        params.references
      )
  }),
  defineMethod({
    name: 'agents.run',
    params: RunAgentParams,
    handler: async (params, { runtime }) => runtime.runRosterAgent(params)
  })
]
