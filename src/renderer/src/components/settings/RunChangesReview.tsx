import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  GitBranchChangeEntry,
  GitBranchCompareResult,
  GitBranchCompareSummary,
  GitDiffResult
} from '../../../../shared/git-diff-compare-types'
import type { RunDiffDataSource } from '@/runtime/run-diff-data-source'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  RunFileDiffPreview,
  runChangesErrorMessage,
  type RunChangesLoadState
} from './RunFileDiffPreview'

type ReviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; baseRef: string; value: GitBranchCompareResult }

function reviewStatusMessage(summary: GitBranchCompareSummary): string | null {
  if (summary.status === 'ready') {
    return null
  }
  if (summary.errorMessage) {
    return summary.errorMessage
  }
  switch (summary.status) {
    case 'invalid-base':
      return `Base ref ${summary.baseRef} is not valid in this repository.`
    case 'unborn-head':
      return 'The Run repository has no HEAD commit to review.'
    case 'no-merge-base':
      return `No merge base exists between ${summary.baseRef} and ${summary.compareRef}.`
    case 'loading':
      return 'The review snapshot is still loading. Load it again.'
    case 'error':
      return 'The review snapshot could not be loaded.'
  }
}

function ReviewSummary({ summary }: { summary: GitBranchCompareSummary }): React.JSX.Element {
  const items = [
    ['Base', summary.baseRef],
    ['Compare', summary.compareRef],
    ['Head', summary.headOid ?? 'Unavailable'],
    ['Changed files', String(summary.changedFiles)],
    ['Commits ahead', summary.commitsAhead == null ? 'Unavailable' : String(summary.commitsAhead)],
    [
      'Commits behind',
      summary.commitsBehind == null ? 'Unavailable' : String(summary.commitsBehind)
    ]
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border px-3 py-3 text-xs lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {label}
          </dt>
          <dd className="truncate font-mono text-foreground" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function RunChangesReview({ source }: { source: RunDiffDataSource }): React.JSX.Element {
  const [baseRefDraft, setBaseRefDraft] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [review, setReview] = useState<ReviewState>({ kind: 'idle' })
  const [selected, setSelected] = useState<GitBranchChangeEntry | null>(null)
  const [diff, setDiff] = useState<RunChangesLoadState<GitDiffResult> | null>(null)

  async function loadReview(): Promise<void> {
    let baseRef: string
    try {
      baseRef = source.validateReviewBaseRef(baseRefDraft)
    } catch (error) {
      setInputError(runChangesErrorMessage(error))
      return
    }
    setInputError(null)
    setReview({ kind: 'loading' })
    setSelected(null)
    setDiff(null)
    try {
      const value = await source.getReview(baseRef)
      setReview({ kind: 'ready', baseRef, value })
    } catch (error) {
      setReview({ kind: 'error', message: runChangesErrorMessage(error) })
    }
  }

  useEffect(() => {
    if (!selected || review.kind !== 'ready') {
      return
    }
    let active = true
    const { baseRef, value } = review
    setDiff({ kind: 'loading' })
    void source
      .getReviewDiff({
        baseRef,
        filePath: selected.path,
        ...(selected.oldPath ? { oldPath: selected.oldPath } : {}),
        ...(value.summary.headOid ? { headOid: value.summary.headOid } : {})
      })
      .then((result) => {
        if (active) {
          setDiff({ kind: 'ready', value: result })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setDiff({ kind: 'error', message: runChangesErrorMessage(error) })
        }
      })
    return () => {
      active = false
    }
  }, [review, selected, source])

  const snapshot = review.kind === 'ready' ? review : null
  const statusMessage = snapshot ? reviewStatusMessage(snapshot.value.summary) : null
  const entries = snapshot?.value.summary.status === 'ready' ? snapshot.value.entries : []
  const modelKey =
    snapshot && selected
      ? JSON.stringify([
          source.cacheKey,
          snapshot.baseRef,
          snapshot.value.summary.headOid,
          selected.path,
          selected.oldPath ?? null
        ])
      : source.cacheKey

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex items-start gap-2 border-b border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void loadReview()
        }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            value={baseRefDraft}
            onChange={(event) => setBaseRefDraft(event.target.value)}
            placeholder="origin/main"
            aria-label="Base Git ref"
            aria-invalid={inputError ? true : undefined}
            disabled={review.kind === 'loading'}
          />
          {inputError ? (
            <p role="alert" className="text-xs text-destructive">
              {inputError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Compare the Run HEAD with a Git base ref.
            </p>
          )}
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={review.kind === 'loading'}>
          {review.kind === 'loading' ? <Loader2 className="size-4 animate-spin" /> : null}
          Load Review
        </Button>
      </form>

      {review.kind === 'idle' ? (
        <p className="m-auto px-6 text-center text-sm text-muted-foreground">
          Enter a base ref, then load a review snapshot.
        </p>
      ) : null}
      {review.kind === 'loading' ? (
        <p role="status" className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Connecting to the Run-owned Computer. A stopped Computer will be woken first.
        </p>
      ) : null}
      {review.kind === 'error' ? (
        <p role="alert" className="m-auto max-w-lg px-6 text-center text-sm text-destructive">
          {review.message}
        </p>
      ) : null}
      {snapshot ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ReviewSummary summary={snapshot.value.summary} />
          {statusMessage ? (
            <p role="alert" className="m-auto max-w-lg px-6 text-center text-sm text-destructive">
              {statusMessage}
            </p>
          ) : entries.length === 0 ? (
            <p className="m-auto text-sm text-muted-foreground">No changed files in this review.</p>
          ) : (
            <div className="flex min-h-0 flex-1">
              <aside className="scrollbar-sleek w-64 shrink-0 overflow-y-auto border-r border-border p-2">
                <div className="space-y-1">
                  {entries.map((entry) => {
                    const entryKey = `${entry.oldPath ?? ''}:${entry.path}`
                    return (
                      <button
                        key={entryKey}
                        type="button"
                        data-current={selected === entry}
                        className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[current=true]:bg-accent"
                        onClick={() => setSelected(entry)}
                      >
                        <span className="min-w-0 truncate font-mono text-xs">{entry.path}</span>
                        <Badge variant="outline">{entry.status}</Badge>
                      </button>
                    )
                  })}
                </div>
              </aside>
              <div className="flex min-w-0 flex-1 flex-col bg-editor-surface">
                <RunFileDiffPreview
                  modelKey={modelKey}
                  filePath={selected?.path ?? null}
                  diff={diff}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
