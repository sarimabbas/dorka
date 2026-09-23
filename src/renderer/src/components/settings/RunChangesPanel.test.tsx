// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiffViewerProps } from '../editor/diff-viewer-props'
import { createRunDiffDataSource } from '@/runtime/run-diff-data-source'
import { RunChangesPanel } from './RunChangesPanel'

const viewer = vi.hoisted(() => ({ props: null as DiffViewerProps | null }))

vi.mock('@/components/editor/editor-lazy-views', () => ({
  DiffViewer: (props: DiffViewerProps) => {
    viewer.props = props
    return <div>selected diff rendered</div>
  }
}))

vi.mock('@/runtime/run-diff-data-source', () => ({ createRunDiffDataSource: vi.fn() }))

const createSource = vi.mocked(createRunDiffDataSource)
const getStatus = vi.fn()
const getDiff = vi.fn()

beforeEach(() => {
  viewer.props = null
  getStatus.mockReset()
  getDiff.mockReset()
  getStatus.mockResolvedValue({
    entries: [{ path: 'src/a.ts', area: 'unstaged', status: 'modified' }],
    conflictOperation: 'unknown'
  })
  getDiff.mockResolvedValue({
    kind: 'text',
    originalContent: 'before',
    modifiedContent: 'after',
    originalIsBinary: false,
    modifiedIsBinary: false
  })
  createSource.mockReturnValue({
    runId: 'run-1',
    cacheKey: '["run","run-1"]',
    getDiffCacheKey: (entry) => `${entry.area}:${entry.path}`,
    getStatus,
    getDiff,
    getReview: vi.fn(),
    getReviewDiff: vi.fn()
  })
})

afterEach(cleanup)

describe('RunChangesPanel', () => {
  it('loads and renders only the selected Run-owned file diff', async () => {
    const user = userEvent.setup()
    render(<RunChangesPanel runId="run-1" target={{ kind: 'local' }} open onOpenChange={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /src\/a\.ts/ }))

    expect(await screen.findByText('selected diff rendered')).toBeTruthy()
    expect(getStatus).toHaveBeenCalledOnce()
    expect(getDiff).toHaveBeenCalledWith({
      path: 'src/a.ts',
      area: 'unstaged',
      status: 'modified'
    })
    await waitFor(() => expect(viewer.props).not.toBeNull())
    expect(viewer.props).toMatchObject({
      originalContent: 'before',
      modifiedContent: 'after',
      filePath: 'src/a.ts',
      relativePath: 'src/a.ts',
      language: 'typescript',
      sideBySide: true
    })
    expect(viewer.props).not.toHaveProperty('worktreeId')
    expect(viewer.props).not.toHaveProperty('onAddLineComment')
  })
})
