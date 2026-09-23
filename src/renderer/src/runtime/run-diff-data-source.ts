import type { GitBranchCompareResult, GitDiffResult } from '../../../shared/git-diff-compare-types'
import type { GitStatusEntry, GitStatusResult } from '../../../shared/git-status-types'
import {
  AGENT_SOURCE_CONTROL_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '../../../shared/protocol-version'
import { AgentSourceControlReviewParams } from '../../../shared/rpc-contract/agent-source-control-params'
import { ensureLocalRuntimeCapabilities } from './local-runtime-capabilities'
import {
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability,
  type RuntimeClientTarget
} from './runtime-rpc-client'

export class RunSourceControlUnsupportedError extends Error {
  constructor() {
    super('Run changes require source-control support from this Dorka runtime.')
    this.name = 'RunSourceControlUnsupportedError'
  }
}

export type RunDiffDataSource = {
  readonly runId: string
  readonly cacheKey: string
  getDiffCacheKey: (entry: Pick<GitStatusEntry, 'area' | 'path'>) => string
  validateReviewBaseRef: (baseRef: string) => string
  getStatus: () => Promise<GitStatusResult>
  getDiff: (entry: Pick<GitStatusEntry, 'area' | 'path'>) => Promise<GitDiffResult>
  getReview: (baseRef: string) => Promise<GitBranchCompareResult>
  getReviewDiff: (args: {
    baseRef: string
    filePath: string
    oldPath?: string
    headOid?: string
  }) => Promise<GitDiffResult>
}

async function supportsCapability(
  target: RuntimeClientTarget,
  capability: RuntimeCapability
): Promise<boolean | null> {
  if (target.kind === 'environment') {
    return runtimeEnvironmentSupportsCapability(target.environmentId, capability)
  }
  return (await ensureLocalRuntimeCapabilities())?.includes(capability) ?? null
}

async function assertRunSourceControlSupported(target: RuntimeClientTarget): Promise<void> {
  const supported = await supportsCapability(target, AGENT_SOURCE_CONTROL_RUNTIME_CAPABILITY)
  if (supported === false) {
    throw new RunSourceControlUnsupportedError()
  }
  if (supported == null) {
    throw new Error('Could not verify Run source-control support.')
  }
}

function validateReviewBaseRef(runId: string, input: string): string {
  const result = AgentSourceControlReviewParams.safeParse({ runId, baseRef: input.trim() })
  if (!result.success) {
    throw new Error('Enter a valid non-empty Git base ref.')
  }
  return result.data.baseRef
}

export function createRunDiffDataSource(
  target: RuntimeClientTarget,
  requestedRunId: string
): RunDiffDataSource {
  const runId = requestedRunId.trim()
  if (!runId) {
    throw new Error('A run id is required for source control.')
  }
  const cacheKey = JSON.stringify(['run', runId])
  const assertSupported = () => assertRunSourceControlSupported(target)
  const parseBaseRef = (baseRef: string) => validateReviewBaseRef(runId, baseRef)

  return {
    runId,
    cacheKey,
    getDiffCacheKey: (entry) => JSON.stringify(['run', runId, entry.area, entry.path]),
    validateReviewBaseRef: parseBaseRef,
    getStatus: async () => {
      await assertSupported()
      return callRuntimeRpc<GitStatusResult>(target, 'agents.sourceControl.status', { runId })
    },
    getDiff: async (entry) => {
      await assertSupported()
      return callRuntimeRpc<GitDiffResult>(target, 'agents.sourceControl.diff', {
        runId,
        filePath: entry.path,
        area: entry.area === 'staged' ? 'staged' : 'unstaged'
      })
    },
    getReview: async (baseRef) => {
      const validatedBaseRef = parseBaseRef(baseRef)
      await assertSupported()
      return callRuntimeRpc<GitBranchCompareResult>(target, 'agents.sourceControl.review', {
        runId,
        baseRef: validatedBaseRef
      })
    },
    getReviewDiff: async ({ baseRef, filePath, oldPath, headOid }) => {
      const validatedBaseRef = parseBaseRef(baseRef)
      await assertSupported()
      return callRuntimeRpc<GitDiffResult>(target, 'agents.sourceControl.reviewDiff', {
        runId,
        baseRef: validatedBaseRef,
        filePath,
        ...(oldPath ? { oldPath } : {}),
        ...(headOid ? { headOid } : {})
      })
    }
  }
}
