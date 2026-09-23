import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Button } from '../ui/button'

type TerminalReadResult = {
  terminal: {
    tail: string[]
  }
}

type OutputState =
  | { kind: 'loading' }
  | { kind: 'ready'; lines: string[] }
  | { kind: 'error'; message: string }

export function RunTerminalOutput({
  terminal,
  target
}: {
  terminal: string
  target: RuntimeClientTarget
}): React.JSX.Element {
  const [state, setState] = useState<OutputState>({ kind: 'loading' })

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' })
    try {
      const result = await callRuntimeRpc<TerminalReadResult>(target, 'terminal.read', {
        terminal,
        limit: 200
      })
      setState({ kind: 'ready', lines: result.terminal.tail })
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Terminal output could not be loaded.'
      })
    }
  }, [target, terminal])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div
      className="mt-2 rounded-md border border-border bg-muted/30 p-2"
      aria-label="Terminal output"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          Terminal output
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={state.kind === 'loading'}
          onClick={() => void load()}
        >
          {state.kind === 'loading' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>
      {state.kind === 'loading' ? (
        <p className="text-xs text-muted-foreground">Reading terminal…</p>
      ) : state.kind === 'error' ? (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : (
        <pre className="scrollbar-sleek max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
          {state.lines.length > 0 ? state.lines.join('\n') : 'No terminal output yet.'}
        </pre>
      )}
    </div>
  )
}
