import { useEffect, useId, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import type { Agent, Run } from '../../../../shared/agent-roster'
import type { ComputerRuntimeInfo } from '../../../../shared/computer-runtime'
import {
  listRuntimeAgentComputers,
  runRuntimeAgentPreset
} from '@/runtime/runtime-agent-roster-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'

type ComputerLoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; computers: ComputerRuntimeInfo[] }

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The agent preset could not be launched.'
}

export function AgentPresetRow({
  preset,
  target
}: {
  preset: Agent
  target: RuntimeClientTarget
}): React.JSX.Element {
  const [launchOpen, setLaunchOpen] = useState(false)
  return (
    <div>
      <div className="flex items-start justify-between gap-4 px-3 py-2.5">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">{preset.name}</p>
          <p className="text-xs text-muted-foreground">{preset.job}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {preset.harnessId}
            {preset.model ? ` · ${preset.model}` : ''}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-expanded={launchOpen}
            onClick={() => setLaunchOpen((current) => !current)}
          >
            Launch
          </Button>
        </div>
      </div>
      {launchOpen ? (
        <AgentPresetLaunchForm
          preset={preset}
          target={target}
          onClose={() => setLaunchOpen(false)}
        />
      ) : null}
    </div>
  )
}

function AgentPresetLaunchForm({
  preset,
  target,
  onClose
}: {
  preset: Agent
  target: RuntimeClientTarget
  onClose: () => void
}): React.JSX.Element {
  const computerSelectId = useId()
  const promptId = useId()
  const [computers, setComputers] = useState<ComputerLoadState>({ kind: 'loading' })
  const [computerId, setComputerId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<Run | null>(null)

  useEffect(() => {
    let active = true
    void listRuntimeAgentComputers(target)
      .then((listed) => {
        if (active) {
          setComputers({
            kind: 'ready',
            computers: listed.filter(
              (computer) => computer.state === 'running' || computer.state === 'stopped'
            )
          })
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setComputers({ kind: 'error', message: errorMessage(cause) })
        }
      })
    return () => {
      active = false
    }
  }, [target])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const taskPrompt = prompt.trim()
    if (!computerId || !taskPrompt || submitting) {
      setError('Select a running or stopped Computer and enter a task prompt.')
      return
    }
    setSubmitting(true)
    setError(null)
    setRun(null)
    try {
      setRun(
        await runRuntimeAgentPreset(target, {
          agentId: preset.id,
          computerId,
          prompt: taskPrompt
        })
      )
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-3 border-t border-border bg-muted/30 px-3 py-3" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor={computerSelectId}>Computer</Label>
        {computers.kind === 'loading' ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading Computers…
          </p>
        ) : computers.kind === 'error' ? (
          <p role="alert" className="text-xs text-destructive">
            {computers.message}
          </p>
        ) : computers.computers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No running or stopped Computers are available on this runtime.
          </p>
        ) : (
          <Select value={computerId} onValueChange={setComputerId}>
            <SelectTrigger id={computerSelectId} className="w-full">
              <SelectValue placeholder="Select a Computer" />
            </SelectTrigger>
            <SelectContent>
              {computers.computers.map((computer) => (
                <SelectItem key={computer.id} value={computer.id}>
                  {computer.name} · {computer.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={promptId}>Task prompt</Label>
        <Textarea
          id={promptId}
          autoFocus
          required
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the task for this run."
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {run ? (
        <div role="status" className="space-y-1 rounded-md border border-border bg-background p-3">
          <p className="text-xs font-medium">Run status: {run.status}</p>
          <p className="font-mono text-[11px] text-muted-foreground">Run: {run.id}</p>
          {run.terminalSessionId ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              Terminal: {run.terminalSessionId}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Terminal identity was not returned.</p>
          )}
          {run.processIdentity ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              Process: {run.processIdentity}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={submitting || computers.kind !== 'ready' || computers.computers.length === 0}
        >
          {submitting ? 'Launching…' : 'Launch agent'}
        </Button>
      </div>
    </form>
  )
}
