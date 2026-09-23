import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import type { GitDiffResult } from '../../../../shared/git-diff-compare-types'
import { DiffViewer } from '@/components/editor/editor-lazy-views'
import { detectLanguage } from '@/lib/language-detect'

export type RunChangesLoadState<T> =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; value: T }

export function runChangesErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message ? error.message : 'Changes could not be loaded.'
  return message.toLowerCase().includes('unverifiable')
    ? `Changes are unverifiable: ${message}`
    : message
}

export function RunFileDiffPreview({
  modelKey,
  filePath,
  diff
}: {
  modelKey: string
  filePath: string | null
  diff: RunChangesLoadState<GitDiffResult> | null
}): React.JSX.Element {
  if (!filePath) {
    return <p className="m-auto text-sm text-muted-foreground">Select a changed file.</p>
  }
  if (!diff || diff.kind === 'loading') {
    return (
      <p role="status" className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading {filePath}…
      </p>
    )
  }
  if (diff.kind === 'error') {
    return (
      <p role="alert" className="m-auto max-w-lg px-6 text-center text-sm text-destructive">
        {diff.message}
      </p>
    )
  }
  if (diff.value.kind === 'binary') {
    return (
      <p className="m-auto text-sm text-muted-foreground">
        Text diff is unavailable for this binary file.
      </p>
    )
  }
  return (
    <Suspense
      fallback={<p className="m-auto text-sm text-muted-foreground">Loading diff viewer…</p>}
    >
      <DiffViewer
        modelKey={modelKey}
        originalContent={diff.value.originalContent}
        modifiedContent={diff.value.modifiedContent}
        largeDiffRenderLimit={diff.value.largeDiffRenderLimit}
        language={detectLanguage(filePath)}
        filePath={filePath}
        relativePath={filePath}
        sideBySide
      />
    </Suspense>
  )
}
