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
const getReview = vi.fn()
const getReviewDiff = vi.fn()

beforeEach(() => {
  viewer.props = null
  getStatus.mockReset()
  getDiff.mockReset()
  getReview.mockReset()
  getReviewDiff.mockReset()
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
  getReview.mockResolvedValue({
    summary: {
      baseRef: 'origin/main',
      baseOid: 'b'.repeat(40),
      compareRef: 'HEAD',
      headOid: 'a'.repeat(40),
      mergeBase: 'c'.repeat(40),
      changedFiles: 1,
      commitsAhead: 2,
      commitsBehind: 1,
      status: 'ready'
    },
    entries: [
      { path: 'src/new.ts', oldPath: 'src/old.ts', status: 'renamed', added: 4, removed: 2 }
    ]
  })
  getReviewDiff.mockResolvedValue({
    kind: 'text',
    originalContent: 'review before',
    modifiedContent: 'review after',
    originalIsBinary: false,
    modifiedIsBinary: false
  })
  createSource.mockReturnValue({
    runId: 'run-1',
    cacheKey: '["run","run-1"]',
    getDiffCacheKey: (entry) => `${entry.area}:${entry.path}`,
    validateReviewBaseRef: (input) => {
      const value = input.trim()
      if (!value || value.startsWith('-')) {
        throw new Error('Enter a valid non-empty Git base ref.')
      }
      return value
    },
    getStatus,
    getDiff,
    getReview,
    getReviewDiff
  })
})

afterEach(cleanup)

describe('RunChangesPanel', () => {
  it('preserves the Working Tree diff flow', async () => {
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

  it('does not load Review until requested and binds file diff to the loaded head snapshot', async () => {
    const user = userEvent.setup()
    render(<RunChangesPanel runId="run-1" target={{ kind: 'local' }} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(getReview).not.toHaveBeenCalled()
    expect(getReviewDiff).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox', { name: 'Base Git ref' })
    await user.type(input, ' origin/main ')
    await user.click(screen.getByRole('button', { name: 'Load Review' }))

    expect(await screen.findByText('src/new.ts')).toBeTruthy()
    expect(getReview).toHaveBeenCalledWith('origin/main')
    expect(screen.getByText('Changed files').nextElementSibling?.textContent).toBe('1')
    expect(screen.getByText('Commits ahead').nextElementSibling?.textContent).toBe('2')
    expect(screen.getByText('Commits behind').nextElementSibling?.textContent).toBe('1')

    await user.clear(input)
    await user.type(input, 'origin/other')
    await user.click(screen.getByRole('button', { name: /src\/new\.ts/ }))

    await waitFor(() =>
      expect(getReviewDiff).toHaveBeenCalledWith({
        baseRef: 'origin/main',
        filePath: 'src/new.ts',
        oldPath: 'src/old.ts',
        headOid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      })
    )
    expect(await screen.findByText('selected diff rendered')).toBeTruthy()
    expect(viewer.props).toMatchObject({
      originalContent: 'review before',
      modifiedContent: 'review after',
      filePath: 'src/new.ts'
    })
  })

  it('rejects an invalid Review ref without loading a snapshot', async () => {
    const user = userEvent.setup()
    render(<RunChangesPanel runId="run-1" target={{ kind: 'local' }} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    await user.type(screen.getByRole('textbox', { name: 'Base Git ref' }), '--upload-pack=bad')
    await user.click(screen.getByRole('button', { name: 'Load Review' }))

    expect((await screen.findByRole('alert')).textContent).toContain('valid non-empty Git base ref')
    expect(getReview).not.toHaveBeenCalled()
    expect(getReviewDiff).not.toHaveBeenCalled()
  })

  it('shows empty Review snapshots honestly', async () => {
    const user = userEvent.setup()
    getReview.mockResolvedValueOnce({
      summary: {
        baseRef: 'origin/main',
        baseOid: 'b'.repeat(40),
        compareRef: 'HEAD',
        headOid: 'a'.repeat(40),
        mergeBase: 'c'.repeat(40),
        changedFiles: 0,
        status: 'ready'
      },
      entries: []
    })
    render(<RunChangesPanel runId="run-1" target={{ kind: 'local' }} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    await user.type(screen.getByRole('textbox', { name: 'Base Git ref' }), 'origin/main')
    await user.click(screen.getByRole('button', { name: 'Load Review' }))

    expect(await screen.findByText('No changed files in this review.')).toBeTruthy()
  })

  it('does not present a binary Review file as a text diff', async () => {
    const user = userEvent.setup()
    getReviewDiff.mockResolvedValueOnce({
      kind: 'binary',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: true,
      modifiedIsBinary: false
    })
    render(<RunChangesPanel runId="run-1" target={{ kind: 'local' }} open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    await user.type(screen.getByRole('textbox', { name: 'Base Git ref' }), 'origin/main')
    await user.click(screen.getByRole('button', { name: 'Load Review' }))
    await user.click(await screen.findByRole('button', { name: /src\/new\.ts/ }))

    expect(await screen.findByText('Text diff is unavailable for this binary file.')).toBeTruthy()
    expect(viewer.props).toBeNull()
  })
})
