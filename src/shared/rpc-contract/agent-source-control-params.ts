import { z } from 'zod'
import { isSafeGitRefName } from '../git-status-upstream-ref'

const Id = z.string().trim().min(1)
const RelativePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Expected a normalized repository-relative POSIX path'
  )
const BaseRef = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('-'), 'Base ref must not start with -')
  .refine(
    (value) => isSafeGitRefName(value.startsWith('refs/') ? value : `refs/remotes/${value}`),
    'Expected a safe Git ref'
  )
const FullGitObjectId = z.string().regex(/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/)

export const AgentSourceControlStatusParams = z.object({ runId: Id }).strict()

export const AgentSourceControlDiffParams = z
  .object({
    runId: Id,
    filePath: RelativePath,
    area: z.enum(['staged', 'unstaged'])
  })
  .strict()

export const AgentSourceControlReviewParams = z
  .object({
    runId: Id,
    baseRef: BaseRef
  })
  .strict()

export const AgentSourceControlReviewDiffParams = z
  .object({
    runId: Id,
    baseRef: BaseRef,
    filePath: RelativePath,
    oldPath: RelativePath.optional(),
    headOid: FullGitObjectId.optional()
  })
  .strict()

export type AgentSourceControlDiffRequest = z.infer<typeof AgentSourceControlDiffParams>
export type AgentSourceControlReviewRequest = z.infer<typeof AgentSourceControlReviewParams>
export type AgentSourceControlReviewDiffRequest = z.infer<typeof AgentSourceControlReviewDiffParams>
