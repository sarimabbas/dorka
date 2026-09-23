import {
  AgentSourceControlDiffParams,
  AgentSourceControlReviewDiffParams,
  AgentSourceControlReviewParams,
  AgentSourceControlStatusParams
} from '../../../../shared/rpc-contract/agent-source-control-params'
import { defineMethod } from '../core'

export const AGENT_SOURCE_CONTROL_METHODS = [
  defineMethod({
    name: 'agents.sourceControl.status',
    params: AgentSourceControlStatusParams,
    handler: async (params, { runtime }) => runtime.getRunSourceControlStatus(params.runId)
  }),
  defineMethod({
    name: 'agents.sourceControl.diff',
    params: AgentSourceControlDiffParams,
    handler: async (params, { runtime }) => runtime.getRunSourceControlDiff(params)
  }),
  defineMethod({
    name: 'agents.sourceControl.review',
    params: AgentSourceControlReviewParams,
    handler: async (params, { runtime }) => runtime.getRunSourceControlReview(params)
  }),
  defineMethod({
    name: 'agents.sourceControl.reviewDiff',
    params: AgentSourceControlReviewDiffParams,
    handler: async (params, { runtime }) => runtime.getRunSourceControlReviewDiff(params)
  })
]
