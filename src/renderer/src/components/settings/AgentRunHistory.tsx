import { useEffect, useMemo, useState } from 'react'
import type { Run } from '../../../../shared/agent-roster'
import {
  AgentRunHistoryUnsupportedError,
  listRuntimeAgentRuns
} from '@/runtime/runtime-agent-roster-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { RunChangesPanel } from './RunChangesPanel'
import { RunTerminalOutput } from './RunTerminalOutput'
import { findAgentRunTerminalTarget } from './agent-run-terminal-target'

const MAX_RECENT_RUNS = 5

function computerLabel(computerId: string): string {
  return computerId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

function runErrorMessage(error: unknown): string {
  if (error instanceof AgentRunHistoryUnsupportedError) {
    return error.message
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Run history could not be loaded.'
}

export function AgentRunHistory({
  agentId,
  target,
  refreshKey
}: {
  agentId: string
  target: RuntimeClientTarget
  refreshKey: number
}): React.JSX.Element {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [terminalRunId, setTerminalRunId] = useState<string | null>(null)
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const terminalLayoutsByTabId = useAppStore((state) => state.terminalLayoutsByTabId)
  const closeSettingsPage = useAppStore((state) => state.closeSettingsPage)
  const terminalTargets = useMemo(
    () =>
      new Map(
        (runs ?? []).flatMap((run) => {
          const runTarget = findAgentRunTerminalTarget(
            { tabsByWorktree, terminalLayoutsByTabId },
            run,
            target
          )
          return runTarget ? [[run.id, runTarget] as const] : []
        })
      ),
    [runs, tabsByWorktree, target, terminalLayoutsByTabId]
  )

  useEffect(() => {
    let active = true
    setError(null)
    void listRuntimeAgentRuns(target, { agentId })
      .then((listed) => {
        if (active) {
          setRuns(
            [...listed]
              .sort((left, right) => right.createdAt - left.createdAt)
              .slice(0, MAX_RECENT_RUNS)
          )
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setRuns(null)
          setError(runErrorMessage(cause))
        }
      })
    return () => {
      active = false
    }
  }, [agentId, refreshKey, target])

  return (
    <div className="border-t border-border bg-muted/20 px-3 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Recent Runs
      </p>
      {error ? (
        <p role="status" className="text-xs text-muted-foreground">
          {error}
        </p>
      ) : runs === null ? (
        <p className="text-xs text-muted-foreground">Loading Runs…</p>
      ) : runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Runs yet.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="rounded-md border border-border bg-background px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={run.status === 'failed' ? 'destructive' : 'outline'}>
                      {run.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {computerLabel(run.computerId)} · {new Date(run.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-foreground">{run.prompt}</p>
                  {run.error ? <p className="text-xs text-destructive">{run.error}</p> : null}
                  <details className="text-[11px] text-muted-foreground">
                    <summary className="w-fit cursor-pointer select-none hover:text-foreground">
                      Details
                    </summary>
                    <div className="mt-1 space-y-0.5 font-mono">
                      <p>Run: {run.id}</p>
                      <p>Computer: {run.computerId}</p>
                      <p>Terminal: {run.terminalSessionId ?? 'unavailable'}</p>
                      <p>Process: {run.processIdentity ?? 'unavailable'}</p>
                    </div>
                  </details>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {terminalTargets.has(run.id) ? (
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => {
                        const runTarget = terminalTargets.get(run.id)
                        if (
                          !runTarget ||
                          activateAndRevealWorkspace(runTarget.worktreeId) === false
                        ) {
                          return
                        }
                        activateTabAndFocusPane(runTarget.tabId, runTarget.leafId, {
                          flashFocusedPane: true,
                          scrollToBottomIfOutputSinceLastView: true
                        })
                        closeSettingsPage()
                      }}
                    >
                      Open terminal
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!run.terminalSessionId}
                    onClick={() => setTerminalRunId(terminalRunId === run.id ? null : run.id)}
                  >
                    {terminalRunId === run.id ? 'Hide output' : 'View output'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    Changes
                  </Button>
                </div>
              </div>
              {terminalRunId === run.id && run.terminalSessionId ? (
                <RunTerminalOutput terminal={run.terminalSessionId} target={target} />
              ) : null}
            </div>
          ))}
        </div>
      )}
      {selectedRunId ? (
        <RunChangesPanel
          key={selectedRunId}
          runId={selectedRunId}
          target={target}
          open
          onOpenChange={(open) => {
            if (!open) {
              setSelectedRunId(null)
            }
          }}
        />
      ) : null}
    </div>
  )
}
