import { defineMethod } from '../core'
import {
  CreateAgentParams,
  ListAgentsParams,
  MoveAgentParams
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
    name: 'agents.move',
    params: MoveAgentParams,
    handler: async (params, { runtime }) =>
      runtime.moveRosterAgent(params.agentId, params.computerId)
  })
]
