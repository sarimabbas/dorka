import { describe, expect, it, vi } from 'vitest'
import type { Run } from '../../shared/agent-roster'
import type { GitBranchCompareResult, GitDiffResult } from '../../shared/git-diff-compare-types'
import type { GitStatusResult } from '../../shared/git-status-types'
import type { IGitProvider } from '../providers/types'
import { ComputerRunSourceControl } from './computer-run-source-control'

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    agentId: 'agent-1',
    computerId: 'computer-a',
    status: 'running',
    prompt: 'review',
    sourceDirectory: '/workspace/original',
    createdAt: 1,
    ...overrides
  }
}

type Provider = Pick<
  IGitProvider,
  'getStatus' | 'getDiff' | 'getBranchCompare' | 'getBranchDiff' | 'isGitRepoAsync'
>

function fixture(runRecord: Run | null = run()) {
  const diff: GitDiffResult = {
    kind: 'text',
    originalContent: '',
    modifiedContent: '',
    originalIsBinary: false,
    modifiedIsBinary: false
  }
  const compare: GitBranchCompareResult = {
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
  const getStatus = vi.fn(async (): Promise<GitStatusResult> => ({
    entries: [],
    conflictOperation: 'unknown'
  }))
  const getDiff = vi.fn(async (): Promise<GitDiffResult> => diff)
  const getBranchCompare = vi.fn(async (): Promise<GitBranchCompareResult> => compare)
  const getBranchDiff = vi.fn(async (): Promise<GitDiffResult[]> => [])
  const isGitRepoAsync = vi.fn(async () => ({ isRepo: true, rootPath: '/workspace/original' }))
  const provider = { getStatus, getDiff, getBranchCompare, getBranchDiff, isGitRepoAsync }
  const inspect = vi.fn(async (id: string) => ({
    id,
    name: `dorka-computer-${id}`,
    image: 'test',
    state: 'running' as const
  }))
  const start = vi.fn(async (id: string) => ({
    id,
    name: `dorka-computer-${id}`,
    image: 'test',
    state: 'running' as const
  }))
  const connect = vi.fn(async (computerId: string) => ({
    id: `runtime-ssh-computer-${computerId}`,
    label: computerId,
    source: 'manual' as const,
    host: computerId,
    port: 2222,
    username: 'ubuntu'
  }))
  const getRun = vi.fn((_runId: string) => runRecord)
  const getGitProvider = vi.fn<(targetId: string) => Provider | undefined>(() => provider)
  const authority = new ComputerRunSourceControl({
    roster: { getRun },
    computers: { inspect, start },
    host: { connect },
    getGitProvider
  })
  return {
    authority,
    connect,
    getBranchCompare,
    getBranchDiff,
    getDiff,
    getGitProvider,
    getRun,
    getStatus,
    inspect,
    isGitRepoAsync,
    provider,
    start
  }
}

describe('ComputerRunSourceControl', () => {
  it('routes status through the Run Computer and snapshotted source directory', async () => {
    const h = fixture()

    await h.authority.status('run-1')

    expect(h.inspect).toHaveBeenCalledWith('computer-a')
    expect(h.connect).toHaveBeenCalledWith('computer-a')
    expect(h.getGitProvider).toHaveBeenCalledWith('runtime-ssh-computer-computer-a')
    expect(h.isGitRepoAsync).toHaveBeenCalledWith('/workspace/original')
    expect(h.getStatus).toHaveBeenCalledWith('/workspace/original')
  })

  it('maps staged and unstaged areas without accepting a host path', async () => {
    const h = fixture()

    await h.authority.diff({ runId: 'run-1', filePath: 'src/a.ts', area: 'staged' })
    await h.authority.diff({ runId: 'run-1', filePath: 'src/a.ts', area: 'unstaged' })

    expect(h.getDiff).toHaveBeenNthCalledWith(1, '/workspace/original', 'src/a.ts', true)
    expect(h.getDiff).toHaveBeenNthCalledWith(2, '/workspace/original', 'src/a.ts', false)
  })

  it('uses branch comparison operations for provider-neutral current-branch review', async () => {
    const h = fixture()

    await h.authority.review({ runId: 'run-1', baseRef: 'origin/main' })
    await h.authority.reviewDiff({
      runId: 'run-1',
      baseRef: 'origin/main',
      filePath: 'src/a.ts'
    })

    expect(h.getBranchCompare).toHaveBeenCalledWith('/workspace/original', 'origin/main')
    expect(h.getBranchDiff).toHaveBeenCalledWith('/workspace/original', 'origin/main', {
      includePatch: true,
      filePath: 'src/a.ts'
    })
    expect(h.getDiff).not.toHaveBeenCalled()
  })

  it('refuses missing providers and repository roots outside /workspace', async () => {
    const unavailable = fixture()
    unavailable.getGitProvider.mockReturnValueOnce(undefined)
    await expect(unavailable.authority.status('run-1')).rejects.toThrow('unverifiable')
    expect(unavailable.getStatus).not.toHaveBeenCalled()

    const escaped = fixture()
    escaped.isGitRepoAsync.mockResolvedValueOnce({ isRepo: true, rootPath: '/etc' })
    await expect(escaped.authority.status('run-1')).rejects.toThrow('outside /workspace')
    expect(escaped.getStatus).not.toHaveBeenCalled()
  })

  it('keeps providers isolated by each Run immutable Computer id', async () => {
    const h = fixture()
    const statusB = vi.fn(async (): Promise<GitStatusResult> => ({
      entries: [],
      conflictOperation: 'unknown'
    }))
    const providerB: Provider = { ...h.provider, getStatus: statusB }
    h.getRun.mockImplementation((runId) =>
      run({ id: runId, computerId: runId === 'run-a' ? 'computer-a' : 'computer-b' })
    )
    h.getGitProvider.mockImplementation((targetId) =>
      targetId.endsWith('computer-b') ? providerB : h.provider
    )

    await h.authority.status('run-a')
    await h.authority.status('run-b')

    expect(h.connect).toHaveBeenNthCalledWith(1, 'computer-a')
    expect(h.connect).toHaveBeenNthCalledWith(2, 'computer-b')
    expect(h.getStatus).toHaveBeenCalledTimes(1)
    expect(statusB).toHaveBeenCalledTimes(1)
  })

  it('fails before dialing when the Run is missing', async () => {
    const h = fixture(null)

    await expect(h.authority.status('missing')).rejects.toThrow('Run not found')
    expect(h.inspect).not.toHaveBeenCalled()
    expect(h.connect).not.toHaveBeenCalled()
  })
})
