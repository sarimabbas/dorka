import { z } from 'zod'

const Id = z.string().trim().min(1)
const Text = z.string().trim().min(1)
const Timestamp = z.number().int().nonnegative()

export const AgentCharacterSchema = z
  .object({
    color: Text,
    variant: Text
  })
  .strict()

export const AgentSchema = z
  .object({
    id: Id,
    name: Text,
    character: AgentCharacterSchema,
    job: Text,
    harnessId: Id,
    model: Text.optional(),
    promptTemplate: Text,
    workingDirectory: Text.optional(),
    lastComputerId: Id.optional(),
    createdAt: Timestamp,
    updatedAt: Timestamp
  })
  .strict()

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled'
])

export const RunSchema = z
  .object({
    id: Id,
    agentId: Id,
    computerId: Id,
    computerExecutionGeneration: z.uuid().optional(),
    status: RunStatusSchema,
    prompt: Text,
    sourceDirectory: Text.optional(),
    result: z.string().optional(),
    error: Text.optional(),
    terminalSessionId: Id.optional(),
    processIdentity: Text.optional(),
    createdAt: Timestamp,
    startedAt: Timestamp.optional(),
    finishedAt: Timestamp.optional()
  })
  .strict()

export const AgentRosterFileSchema = z
  .object({
    version: z.literal(1),
    agents: z.array(AgentSchema),
    runs: z.array(RunSchema)
  })
  .strict()

export type AgentCharacter = z.infer<typeof AgentCharacterSchema>
export type Agent = z.infer<typeof AgentSchema>
export type RunStatus = z.infer<typeof RunStatusSchema>
export type Run = z.infer<typeof RunSchema>
export type AgentRosterFile = z.infer<typeof AgentRosterFileSchema>

export type AgentCreate = Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'lastComputerId'>
export type AgentUpdate = Partial<AgentCreate>
export type RunCreate = Pick<Run, 'agentId' | 'computerId' | 'prompt' | 'sourceDirectory'> &
  Partial<Pick<Run, 'computerExecutionGeneration' | 'terminalSessionId' | 'processIdentity'>>
export type RunUpdate = Partial<Pick<Run, 'terminalSessionId' | 'processIdentity'>>
export type RunTransition = {
  status: RunStatus
  result?: string
  error?: string
}
