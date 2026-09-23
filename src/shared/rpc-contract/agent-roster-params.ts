import { z } from 'zod'
import { AgentCharacterSchema, AgentReferenceSetSchema } from '../agent-roster'

const Id = z.string().trim().min(1)
const Text = z.string().trim().min(1)

export const ListAgentsParams = z.object({}).strict()

export const ListRunsParams = z
  .object({
    agentId: Id.optional()
  })
  .strict()

export const CreateAgentParams = z
  .object({
    name: Text,
    character: AgentCharacterSchema,
    job: Text,
    harnessId: Id,
    model: Text.optional(),
    promptTemplate: Text,
    workingDirectory: Text.optional()
  })
  .strict()

export const MoveAgentParams = z
  .object({
    agentId: Id,
    computerId: Id
  })
  .strict()

export const UpdateAgentReferencesParams = z
  .object({
    agentId: Id,
    expectedRevision: z.number().int().positive(),
    references: AgentReferenceSetSchema
  })
  .strict()

export const RunAgentParams = z
  .object({
    agentId: Id,
    computerId: Id,
    prompt: Text
  })
  .strict()

export type ListRunsRequest = z.infer<typeof ListRunsParams>
export type UpdateAgentReferencesRequest = z.infer<typeof UpdateAgentReferencesParams>
export type RunAgentRequest = z.infer<typeof RunAgentParams>
