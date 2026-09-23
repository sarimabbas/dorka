import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import type {
  ComputerConfigurationPlan,
  ComputerConfigurationPlanResult,
  ComputerConfigurationReplaceResult,
  ComputerConfigurationSnapshot
} from '../../../../shared/computer-runtime'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { ComputerConfigurationPlanSummary } from './ComputerConfigurationPlanSummary'
import {
  computerConfigurationDraft,
  computerConfigurationRequest,
  type ComputerConfigurationDraft
} from './computer-configuration-draft'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      snapshot: ComputerConfigurationSnapshot
      draft: ComputerConfigurationDraft
    }

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Computer configuration could not be loaded.'
}

export function ComputerConfigurationForm({
  computerId,
  settings
}: {
  computerId: string
  settings: GlobalSettings
}): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [plan, setPlan] = useState<ComputerConfigurationPlan | null>(null)
  const [pending, setPending] = useState<'plan' | 'replace' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nextEnvironmentId, setNextEnvironmentId] = useState(1)

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' })
    setPlan(null)
    setError(null)
    try {
      const snapshot = await callRuntimeRpc<ComputerConfigurationSnapshot>(
        getActiveRuntimeTarget(settings),
        'computers.configuration.get',
        { id: computerId }
      )
      setState({ kind: 'ready', snapshot, draft: computerConfigurationDraft(snapshot) })
    } catch (loadError) {
      setState({ kind: 'error', message: message(loadError) })
    }
  }, [computerId, settings])

  useEffect(() => {
    void load()
  }, [load])

  if (state.kind === 'loading') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading setup…
      </p>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="flex items-center justify-between gap-3" role="alert">
        <p className="text-xs text-destructive">{state.message}</p>
        <Button type="button" size="xs" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    )
  }

  const { snapshot, draft } = state
  const updateDraft = (
    update: (current: ComputerConfigurationDraft) => ComputerConfigurationDraft
  ): void => {
    setPlan(null)
    setError(null)
    setState((current) =>
      current.kind === 'ready' ? { ...current, draft: update(current.draft) } : current
    )
  }
  const review = async (): Promise<void> => {
    setPending('plan')
    setError(null)
    try {
      const result = await callRuntimeRpc<ComputerConfigurationPlanResult>(
        getActiveRuntimeTarget(settings),
        'computers.configuration.plan',
        {
          id: computerId,
          expectedRevision: snapshot.revision,
          configuration: computerConfigurationRequest(draft)
        }
      )
      if (result.outcome === 'conflict') {
        setError('This Computer changed elsewhere. Reload setup before continuing.')
        return
      }
      setPlan(result.plan)
    } catch (planError) {
      setError(message(planError))
    } finally {
      setPending(null)
    }
  }
  const apply = async (): Promise<void> => {
    if (!plan?.replacementRequired) {
      return
    }
    setPending('replace')
    setError(null)
    try {
      const result = await callRuntimeRpc<ComputerConfigurationReplaceResult>(
        getActiveRuntimeTarget(settings),
        'computers.configuration.replace',
        {
          id: computerId,
          expectedRevision: snapshot.revision,
          configuration: computerConfigurationRequest(draft)
        }
      )
      if (result.outcome === 'conflict') {
        setError('This Computer changed elsewhere. Reload setup before continuing.')
        return
      }
      setPlan(null)
      setState({
        kind: 'ready',
        snapshot: result.snapshot,
        draft: computerConfigurationDraft(result.snapshot)
      })
    } catch (replaceError) {
      setError(message(replaceError))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Resources</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['cpus', 'CPUs'],
              ['memoryMb', 'Memory MiB'],
              ['pids', 'Processes']
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`${computerId}-${key}`} className="text-[11px]">
                {label}
              </Label>
              <Input
                id={`${computerId}-${key}`}
                type="number"
                value={draft.resources[key]}
                min={key === 'cpus' ? 0.25 : key === 'memoryMb' ? 256 : 32}
                step={key === 'cpus' ? 0.25 : 1}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    resources: { ...current.resources, [key]: Number(event.target.value) }
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium text-foreground">Environment</p>
          <p className="text-[11px] text-muted-foreground">
            Existing values stay hidden. Uncheck a name to remove or replace it.
          </p>
        </div>
        {snapshot.configuration.environment.map((name) => (
          <label key={name} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={draft.preserve.has(name)}
              onChange={(event) =>
                updateDraft((current) => {
                  const preserve = new Set(current.preserve)
                  if (event.target.checked) {
                    preserve.add(name)
                  } else {
                    preserve.delete(name)
                  }
                  return { ...current, preserve }
                })
              }
            />
            <span className="font-mono">{name}</span>
            <span className="text-muted-foreground">preserve</span>
          </label>
        ))}
        {draft.environment.map((entry) => (
          <div key={entry.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              aria-label="Variable name"
              placeholder="NAME"
              value={entry.name}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  environment: current.environment.map((candidate) =>
                    candidate.id === entry.id
                      ? { ...candidate, name: event.target.value }
                      : candidate
                  )
                }))
              }
            />
            <Input
              aria-label="Variable value"
              placeholder="Value"
              type="password"
              value={entry.value}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  environment: current.environment.map((candidate) =>
                    candidate.id === entry.id
                      ? { ...candidate, value: event.target.value }
                      : candidate
                  )
                }))
              }
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Remove variable"
              onClick={() =>
                updateDraft((current) => ({
                  ...current,
                  environment: current.environment.filter((candidate) => candidate.id !== entry.id)
                }))
              }
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => {
            const id = nextEnvironmentId
            setNextEnvironmentId(id + 1)
            updateDraft((current) => ({
              ...current,
              environment: [...current.environment, { id, name: '', value: '' }]
            }))
          }}
        >
          <Plus /> Add variable
        </Button>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium text-foreground">Premounted folders</p>
          <p className="text-[11px] text-muted-foreground">
            The Server accepts only operator-allowlisted source folders.
          </p>
        </div>
        {draft.premounts.map((mount, index) => (
          <div
            key={`${computerId}-premount-${index}`}
            className="space-y-2 rounded-md border border-border/60 p-2"
          >
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                aria-label="Source folder"
                placeholder="/srv/shared"
                value={mount.source}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    premounts: current.premounts.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, source: event.target.value }
                        : candidate
                    )
                  }))
                }
              />
              <Input
                aria-label="Computer folder"
                placeholder="/shared"
                value={mount.target}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    premounts: current.premounts.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, target: event.target.value }
                        : candidate
                    )
                  }))
                }
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Remove premount"
                onClick={() =>
                  updateDraft((current) => ({
                    ...current,
                    premounts: current.premounts.filter(
                      (_, candidateIndex) => candidateIndex !== index
                    )
                  }))
                }
              >
                <X />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={mount.readOnly}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    premounts: current.premounts.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, readOnly: event.target.checked }
                        : candidate
                    )
                  }))
                }
              />
              Read only
            </label>
          </div>
        ))}
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() =>
            updateDraft((current) => ({
              ...current,
              premounts: [...current.premounts, { source: '', target: '', readOnly: true }]
            }))
          }
        >
          <Plus /> Add folder
        </Button>
      </div>

      {plan ? <ComputerConfigurationPlanSummary plan={plan} /> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {error?.includes('changed elsewhere') ? (
          <Button type="button" size="xs" variant="outline" onClick={() => void load()}>
            Reload
          </Button>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void review()}
        >
          {pending === 'plan' ? <Loader2 className="animate-spin" /> : null}
          Review changes
        </Button>
        {plan ? (
          <Button
            type="button"
            size="xs"
            disabled={!plan.replacementRequired || pending !== null}
            onClick={() => void apply()}
          >
            {pending === 'replace' ? <Loader2 className="animate-spin" /> : null}
            Apply
          </Button>
        ) : null}
      </div>
    </div>
  )
}
