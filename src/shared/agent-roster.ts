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

export const AgentMemoryPolicySchema = z.enum(['none', 'conversation', 'agent'])

export const AgentSchema = z
  .object({
    id: Id,
    name: Text,
    character: AgentCharacterSchema,
    job: Text,
    instructions: Text,
    boundaries: z.array(Text),
    preferredProvider: Text.optional(),
    preferredModel: Text.optional(),
    tools: z.array(Text),
    memoryPolicy: AgentMemoryPolicySchema,
    lastComputerId: Id.optional(),
    createdAt: Timestamp,
    updatedAt: Timestamp
  })
  .strict()

export const ConversationSchema = z
  .object({
    id: Id,
    agentId: Id,
    title: Text.optional(),
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
    conversationId: Id,
    computerId: Id,
    status: RunStatusSchema,
    prompt: Text,
    result: z.string().optional(),
    error: Text.optional(),
    processSessionId: Id.optional(),
    createdAt: Timestamp,
    startedAt: Timestamp.optional(),
    finishedAt: Timestamp.optional()
  })
  .strict()

export const AgentRosterFileSchema = z
  .object({
    version: z.literal(1),
    agents: z.array(AgentSchema),
    conversations: z.array(ConversationSchema),
    runs: z.array(RunSchema)
  })
  .strict()

export type AgentCharacter = z.infer<typeof AgentCharacterSchema>
export type AgentMemoryPolicy = z.infer<typeof AgentMemoryPolicySchema>
export type Agent = z.infer<typeof AgentSchema>
export type Conversation = z.infer<typeof ConversationSchema>
export type RunStatus = z.infer<typeof RunStatusSchema>
export type Run = z.infer<typeof RunSchema>
export type AgentRosterFile = z.infer<typeof AgentRosterFileSchema>

export type AgentCreate = Omit<
  Agent,
  'id' | 'createdAt' | 'updatedAt' | 'lastComputerId' | 'memoryPolicy'
> & {
  memoryPolicy?: AgentMemoryPolicy
}
export type AgentUpdate = Partial<Omit<AgentCreate, 'memoryPolicy'>> & {
  memoryPolicy?: AgentMemoryPolicy
}
export type ConversationCreate = Pick<Conversation, 'agentId' | 'title'>
export type ConversationUpdate = Pick<Conversation, 'title'>
export type RunCreate = Pick<Run, 'agentId' | 'conversationId' | 'prompt'> & {
  computerId?: string
  processSessionId?: string
}
export type RunUpdate = Partial<Pick<Run, 'prompt' | 'processSessionId'>>
export type RunTransition = {
  status: RunStatus
  result?: string
  error?: string
}
