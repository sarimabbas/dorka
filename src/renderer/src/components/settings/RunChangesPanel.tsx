import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { GitDiffResult } from '../../../../shared/git-diff-compare-types'
import type { GitStatusEntry, GitStatusResult } from '../../../../shared/git-status-types'
import { createRunDiffDataSource, type RunDiffDataSource } from '@/runtime/run-diff-data-source'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import {
  RunFileDiffPreview,
  runChangesErrorMessage,
  type RunChangesLoadState
} from './RunFileDiffPreview'
import { RunChangesReview } from './RunChangesReview'

export function RunChangesPanel({
  runId,
  target,
  open,
  onOpenChange
}: {
  runId: string
  target: RuntimeClientTarget
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(92vw,1100px)] sm:max-w-[min(92vw,1100px)]">
        <div className="border-b border-border pr-8">
          <SheetHeader>
            <SheetTitle>Run Changes</SheetTitle>
            <SheetDescription>Run: {runId}</SheetDescription>
          </SheetHeader>
        </div>
        <RunChangesContent runId={runId} target={target} />
      </SheetContent>
    </Sheet>
  )
}

function RunChangesContent({
  runId,
  target
}: {
  runId: string
  target: RuntimeClientTarget
}): React.JSX.Element {
  const source = useMemo(() => createRunDiffDataSource(target, runId), [runId, target])
  return (
    <Tabs defaultValue="working-tree" className="min-h-0 flex-1 gap-0">
      <div className="border-b border-border px-3">
        <TabsList variant="line">
          <TabsTrigger value="working-tree">Working Tree</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="working-tree" className="min-h-0">
        <RunChangesWorkingTree source={source} />
      </TabsContent>
      <TabsContent value="review" className="min-h-0">
        <RunChangesReview source={source} />
      </TabsContent>
    </Tabs>
  )
}

function RunChangesWorkingTree({ source }: { source: RunDiffDataSource }): React.JSX.Element {
  const [statusRequest, setStatusRequest] = useState(0)
  const [status, setStatus] = useState<RunChangesLoadState<GitStatusResult>>({ kind: 'loading' })
  const [selected, setSelected] = useState<GitStatusEntry | null>(null)
  const [diff, setDiff] = useState<RunChangesLoadState<GitDiffResult> | null>(null)

  useEffect(() => {
    let active = true
    setStatus({ kind: 'loading' })
    setSelected(null)
    setDiff(null)
    void source
      .getStatus()
      .then((value) => {
        if (active) {
          setStatus({ kind: 'ready', value })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus({ kind: 'error', message: runChangesErrorMessage(error) })
        }
      })
    return () => {
      active = false
    }
  }, [source, statusRequest])

  useEffect(() => {
    if (!selected) {
      return
    }
    let active = true
    setDiff({ kind: 'loading' })
    void source
      .getDiff(selected)
      .then((value) => {
        if (active) {
          setDiff({ kind: 'ready', value })
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
  }, [selected, source])

  if (status.kind === 'loading') {
    return (
      <div
        role="status"
        className="flex flex-1 items-center justify-center gap-2 px-6 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        Connecting to the Run-owned Computer. A stopped Computer will be woken first.
      </div>
    )
  }
  if (status.kind === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-lg space-y-3 text-center">
          <p role="alert" className="text-sm text-destructive">
            {status.message}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStatusRequest((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const entries = status.value.entries
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="scrollbar-sleek w-64 shrink-0 overflow-y-auto border-r border-border p-2">
        {entries.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">No staged or unstaged changes.</p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => {
              const entryKey = source.getDiffCacheKey(entry)
              const current = selected ? source.getDiffCacheKey(selected) === entryKey : false
              return (
                <button
                  key={entryKey}
                  type="button"
                  data-current={current}
                  className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[current=true]:bg-accent"
                  onClick={() => setSelected(entry)}
                >
                  <span className="min-w-0 truncate font-mono text-xs">{entry.path}</span>
                  <Badge variant="hostContext">{entry.area}</Badge>
                </button>
              )
            })}
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-editor-surface">
        <RunFileDiffPreview
          modelKey={`${source.cacheKey}:${selected?.area ?? ''}:${selected?.path ?? ''}`}
          filePath={selected?.path ?? null}
          diff={diff}
        />
      </div>
    </div>
  )
}
