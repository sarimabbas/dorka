import { z } from 'zod'

const Id = z.string().trim().min(1)
const Text = z.string().trim().min(1)
const Timestamp = z.number().int().nonnegative()
const ReferenceName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9._ -]{0,198}[A-Za-z0-9])?$/,
    'Reference names must be portable names'
  )
  .refine((value) => value !== '.' && value !== '..', 'References use names, not paths')

export const AgentCharacterSchema = z
  .object({
    color: Text,
    variant: Text
  })
  .strict()

export const AgentReferenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('skill'),
      name: ReferenceName,
      scope: z.enum(['global', 'workspace', 'either'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('mcp-server'),
      name: ReferenceName,
      configId: z.enum(['workspace', 'cursor', 'claude-root', 'claude-workspace'])
    })
    .strict()
])

export const AgentReferenceSetSchema = z
  .object({
    version: z.literal(1),
    items: z.array(AgentReferenceSchema).max(64)
  })
  .strict()
  .refine(({ items }) => {
    const keys = items.map((item) =>
      item.kind === 'skill'
        ? `${item.kind}\0${item.name}\0${item.scope}`
        : `${item.kind}\0${item.name}\0${item.configId}`
    )
    return new Set(keys).size === keys.length
  }, 'Agent references must be unique')

const LegacyAgentSchema = z
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

export const AgentSchema = LegacyAgentSchema.extend({
  revision: z.number().int().positive(),
  references: AgentReferenceSetSchema
}).strict()

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
    agentRevision: z.number().int().positive().optional(),
    computerId: Id,
    computerExecutionGeneration: z.uuid().optional(),
    processHost: z.enum(['computer', 'server']).optional(),
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

export const LegacyAgentRosterFileSchema = z
  .object({
    version: z.literal(1),
    agents: z.array(LegacyAgentSchema),
    runs: z.array(RunSchema)
  })
  .strict()

export const AgentRosterFileSchema = z
  .object({
    version: z.literal(2),
    agents: z.array(AgentSchema),
    runs: z.array(RunSchema)
  })
  .strict()

export type AgentCharacter = z.infer<typeof AgentCharacterSchema>
export type AgentReference = z.infer<typeof AgentReferenceSchema>
export type AgentReferenceSet = z.infer<typeof AgentReferenceSetSchema>
export type Agent = z.infer<typeof AgentSchema>
export type RunStatus = z.infer<typeof RunStatusSchema>
export type Run = z.infer<typeof RunSchema>
export type AgentRosterFile = z.infer<typeof AgentRosterFileSchema>
export type LegacyAgentRosterFile = z.infer<typeof LegacyAgentRosterFileSchema>

export type AgentCreate = Omit<
  Agent,
  'id' | 'revision' | 'references' | 'createdAt' | 'updatedAt' | 'lastComputerId'
> & { references?: AgentReferenceSet }
export type AgentUpdate = Partial<AgentCreate>
export type AgentUpdateResult =
  | { outcome: 'updated'; agent: Agent }
  | { outcome: 'conflict'; currentRevision: number }
export type RunCreate = Pick<Run, 'agentId' | 'computerId' | 'prompt' | 'sourceDirectory'> &
  Partial<
    Pick<
      Run,
      'computerExecutionGeneration' | 'processHost' | 'terminalSessionId' | 'processIdentity'
    >
  >
export type RunUpdate = Partial<Pick<Run, 'terminalSessionId' | 'processIdentity'>>
export type RunTransition = {
  status: RunStatus
  result?: string
  error?: string
}
