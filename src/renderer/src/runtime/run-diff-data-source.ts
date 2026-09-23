import type { GitBranchCompareResult, GitDiffResult } from '../../../shared/git-diff-compare-types'
import type { GitStatusEntry, GitStatusResult } from '../../../shared/git-status-types'
import { callRuntimeRpc, type RuntimeClientTarget } from './runtime-rpc-client'

export type RunDiffDataSource = {
  readonly runId: string
  readonly cacheKey: string
  getDiffCacheKey: (entry: Pick<GitStatusEntry, 'area' | 'path'>) => string
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

export function createRunDiffDataSource(
  target: RuntimeClientTarget,
  requestedRunId: string
): RunDiffDataSource {
  const runId = requestedRunId.trim()
  if (!runId) {
    throw new Error('A run id is required for source control.')
  }
  const cacheKey = JSON.stringify(['run', runId])

  return {
    runId,
    cacheKey,
    getDiffCacheKey: (entry) => JSON.stringify(['run', runId, entry.area, entry.path]),
    getStatus: () =>
      callRuntimeRpc<GitStatusResult>(target, 'agents.sourceControl.status', { runId }),
    getDiff: (entry) =>
      callRuntimeRpc<GitDiffResult>(target, 'agents.sourceControl.diff', {
        runId,
        filePath: entry.path,
        area: entry.area === 'staged' ? 'staged' : 'unstaged'
      }),
    getReview: (baseRef) =>
      callRuntimeRpc<GitBranchCompareResult>(target, 'agents.sourceControl.review', {
        runId,
        baseRef
      }),
    getReviewDiff: ({ baseRef, filePath, oldPath, headOid }) =>
      callRuntimeRpc<GitDiffResult>(target, 'agents.sourceControl.reviewDiff', {
        runId,
        baseRef,
        filePath,
        ...(oldPath ? { oldPath } : {}),
        ...(headOid ? { headOid } : {})
      })
  }
}
