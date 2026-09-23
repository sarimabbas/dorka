import { describe, expect, it, vi } from 'vitest'
import type {
  GitBranchCompareResult,
  GitDiffResult
} from '../../../../shared/git-diff-compare-types'
import type { GitStatusResult } from '../../../../shared/git-status-types'
import { DorkaRuntimeService } from '../../dorka-runtime'
import { RpcDispatcher } from '../dispatcher'
import { AGENT_SOURCE_CONTROL_METHODS } from './agent-source-control'

async function dispatch(dispatcher: RpcDispatcher, method: string, params: unknown) {
  return dispatcher.dispatch({ id: method, authToken: 'test', method, params })
}

describe('Run source-control RPC', () => {
  it('exposes only strict run-scoped request fields', () => {
    const methods = new Map(AGENT_SOURCE_CONTROL_METHODS.map((method) => [method.name, method]))

    expect(
      methods.get('agents.sourceControl.status')?.params?.safeParse({ runId: 'run-1' }).success
    ).toBe(true)
    expect(
      methods.get('agents.sourceControl.status')?.params?.safeParse({
        runId: 'run-1',
        computerId: 'computer-a'
      }).success
    ).toBe(false)
    for (const filePath of ['../secret', '/workspace/repo/a', 'src\\a', 'src//a', 'src/a\0b']) {
      expect(
        methods.get('agents.sourceControl.diff')?.params?.safeParse({
          runId: 'run-1',
          filePath,
          area: 'staged'
        }).success
      ).toBe(false)
    }
    expect(
      methods.get('agents.sourceControl.review')?.params?.safeParse({
        runId: 'run-1',
        baseRef: '--upload-pack=bad'
      }).success
    ).toBe(false)
  })

  it('delegates authenticated RPCs to one run authority', async () => {
    const statusResult: GitStatusResult = { entries: [], conflictOperation: 'unknown' }
    const diffResult: GitDiffResult = {
      kind: 'text',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: false,
      modifiedIsBinary: false
    }
    const reviewResult: GitBranchCompareResult = {
      summary: {
        baseRef: 'origin/main',
        baseOid: null,
        compareRef: 'HEAD',
        headOid: null,
        mergeBase: null,
        changedFiles: 0,
        status: 'ready'
      },
      entries: []
    }
    const status = vi.fn(async () => statusResult)
    const diff = vi.fn(async () => diffResult)
    const review = vi.fn(async () => reviewResult)
    const reviewDiff = vi.fn(async () => diffResult)
    const runtime = new DorkaRuntimeService(null, undefined, {
      computerRunSourceControl: { status, diff, review, reviewDiff }
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: AGENT_SOURCE_CONTROL_METHODS })

    await expect(
      dispatch(dispatcher, 'agents.sourceControl.status', { runId: 'run-1' })
    ).resolves.toMatchObject({ ok: true, result: statusResult })
    await expect(
      dispatch(dispatcher, 'agents.sourceControl.diff', {
        runId: 'run-1',
        filePath: 'src/a.ts',
        area: 'unstaged'
      })
    ).resolves.toMatchObject({ ok: true, result: diffResult })
    await expect(
      dispatch(dispatcher, 'agents.sourceControl.review', {
        runId: 'run-1',
        baseRef: 'origin/main'
      })
    ).resolves.toMatchObject({ ok: true, result: reviewResult })
    await expect(
      dispatch(dispatcher, 'agents.sourceControl.reviewDiff', {
        runId: 'run-1',
        baseRef: 'origin/main',
        filePath: 'src/a.ts'
      })
    ).resolves.toMatchObject({ ok: true, result: diffResult })
  })
})
