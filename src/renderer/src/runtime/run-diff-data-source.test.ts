import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_SOURCE_CONTROL_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import { ensureLocalRuntimeCapabilities } from './local-runtime-capabilities'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import { createRunDiffDataSource, RunSourceControlUnsupportedError } from './run-diff-data-source'

vi.mock('./local-runtime-capabilities', () => ({ ensureLocalRuntimeCapabilities: vi.fn() }))
vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

const localCapabilities = vi.mocked(ensureLocalRuntimeCapabilities)
const supportsCapability = vi.mocked(runtimeEnvironmentSupportsCapability)
const rpc = vi.mocked(callRuntimeRpc)
const target = { kind: 'environment' as const, environmentId: 'server-1' }

describe('run diff data source', () => {
  beforeEach(() => {
    rpc.mockReset()
    localCapabilities.mockReset()
    supportsCapability.mockReset()
    localCapabilities.mockResolvedValue([AGENT_SOURCE_CONTROL_RUNTIME_CAPABILITY])
    supportsCapability.mockResolvedValue(true)
  })

  it('isolates every request and cache identity by run id', async () => {
    rpc.mockResolvedValue({ entries: [], conflictOperation: 'unknown' })
    const first = createRunDiffDataSource(target, 'run-1')
    const second = createRunDiffDataSource(target, 'run-2')

    await first.getStatus()
    await second.getStatus()

    expect(first.cacheKey).not.toBe(second.cacheKey)
    expect(first.getDiffCacheKey({ path: 'src/a.ts', area: 'unstaged' })).not.toBe(
      second.getDiffCacheKey({ path: 'src/a.ts', area: 'unstaged' })
    )
    expect(rpc).toHaveBeenNthCalledWith(1, target, 'agents.sourceControl.status', {
      runId: 'run-1'
    })
    expect(rpc).toHaveBeenNthCalledWith(2, target, 'agents.sourceControl.status', {
      runId: 'run-2'
    })
  })

  it('keeps area and path in per-file cache keys', () => {
    const source = createRunDiffDataSource(target, 'run-1')

    expect(source.getDiffCacheKey({ path: 'src/a.ts', area: 'staged' })).not.toBe(
      source.getDiffCacheKey({ path: 'src/a.ts', area: 'unstaged' })
    )
    expect(source.getDiffCacheKey({ path: 'src/a.ts', area: 'unstaged' })).not.toBe(
      source.getDiffCacheKey({ path: 'src/b.ts', area: 'unstaged' })
    )
  })

  it('maps staged separately and sends unstaged for working-tree and untracked entries', async () => {
    rpc.mockResolvedValue({ kind: 'text' })
    const source = createRunDiffDataSource(target, 'run-1')

    await source.getDiff({ path: 'staged.ts', area: 'staged' })
    await source.getDiff({ path: 'working.ts', area: 'unstaged' })
    await source.getDiff({ path: 'new.ts', area: 'untracked' })

    expect(rpc.mock.calls.map((call) => call[2])).toEqual([
      { runId: 'run-1', filePath: 'staged.ts', area: 'staged' },
      { runId: 'run-1', filePath: 'working.ts', area: 'unstaged' },
      { runId: 'run-1', filePath: 'new.ts', area: 'unstaged' }
    ])
  })

  it('always uses run-scoped RPCs, including for a local runtime target', async () => {
    rpc.mockResolvedValue({ entries: [], conflictOperation: 'unknown' })
    const gitStatus = vi.fn()
    vi.stubGlobal('window', { api: { git: { status: gitStatus } } })
    const source = createRunDiffDataSource({ kind: 'local' }, 'run-local')

    await source.getStatus()
    await source.getDiff({ path: 'src/a.ts', area: 'unstaged' })

    expect(rpc).toHaveBeenNthCalledWith(1, { kind: 'local' }, 'agents.sourceControl.status', {
      runId: 'run-local'
    })
    expect(rpc).toHaveBeenNthCalledWith(2, { kind: 'local' }, 'agents.sourceControl.diff', {
      runId: 'run-local',
      filePath: 'src/a.ts',
      area: 'unstaged'
    })
    expect(gitStatus).not.toHaveBeenCalled()
  })

  it.each([
    ['local', { kind: 'local' as const }],
    ['remote', target]
  ])('fails cleanly before calling an unsupported %s runtime', async (kind, runtimeTarget) => {
    if (kind === 'local') {
      localCapabilities.mockResolvedValue([])
    } else {
      supportsCapability.mockResolvedValue(false)
    }
    const source = createRunDiffDataSource(runtimeTarget, 'run-1')

    await expect(source.getStatus()).rejects.toBeInstanceOf(RunSourceControlUnsupportedError)
    await expect(source.getDiff({ path: 'src/a.ts', area: 'unstaged' })).rejects.toBeInstanceOf(
      RunSourceControlUnsupportedError
    )
    await expect(source.getReview('origin/main')).rejects.toBeInstanceOf(
      RunSourceControlUnsupportedError
    )
    await expect(
      source.getReviewDiff({ baseRef: 'origin/main', filePath: 'src/a.ts' })
    ).rejects.toBeInstanceOf(RunSourceControlUnsupportedError)

    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an invalid base ref before probing or calling the runtime', async () => {
    const source = createRunDiffDataSource(target, 'run-1')

    expect(() => source.validateReviewBaseRef('   ')).toThrow('valid non-empty Git base ref')
    await expect(source.getReview('--upload-pack=bad')).rejects.toThrow(
      'valid non-empty Git base ref'
    )

    expect(supportsCapability).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends only review RPC schema fields', async () => {
    rpc.mockResolvedValue({})
    const source = createRunDiffDataSource(target, 'run-1')

    await source.getReview(' origin/main ')
    await source.getReviewDiff({
      baseRef: 'origin/main',
      filePath: 'src/new.ts',
      oldPath: 'src/old.ts',
      headOid: 'a'.repeat(40)
    })

    expect(rpc).toHaveBeenNthCalledWith(1, target, 'agents.sourceControl.review', {
      runId: 'run-1',
      baseRef: 'origin/main'
    })
    expect(rpc).toHaveBeenNthCalledWith(2, target, 'agents.sourceControl.reviewDiff', {
      runId: 'run-1',
      baseRef: 'origin/main',
      filePath: 'src/new.ts',
      oldPath: 'src/old.ts',
      headOid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    })
  })
})
