import { z } from 'zod'
import { AgentCharacterSchema } from '../agent-roster'

const Id = z.string().trim().min(1)
const Text = z.string().trim().min(1)

export const ListAgentsParams = z.object({}).strict()

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
