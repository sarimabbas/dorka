import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import type {
  ComputerConfigurationInput,
  ComputerConfigurationPlan,
  ComputerConfigurationPlanResult,
  ComputerConfigurationReplaceResult,
  ComputerConfigurationSnapshot
} from '../../../../shared/computer-runtime'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { ComputerConfigurationPlanSummary } from './ComputerConfigurationPlanSummary'
import { ComputerResourceFields } from './ComputerResourceFields'
import {
  computerConfigurationDraft,
  computerConfigurationRequest,
  type ComputerConfigurationDraft
} from './computer-configuration-draft'

type ReviewedPlan = {
  plan: ComputerConfigurationPlan
  request: ComputerConfigurationInput
  draftVersion: number
}

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
  const [reviewed, setReviewed] = useState<ReviewedPlan | null>(null)
  const [pending, setPending] = useState<'plan' | 'replace' | null>(null)
  const draftVersion = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [nextEnvironmentId, setNextEnvironmentId] = useState(1)

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' })
    setReviewed(null)
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
    draftVersion.current += 1
    setReviewed(null)
    setError(null)
    setState((current) =>
      current.kind === 'ready' ? { ...current, draft: update(current.draft) } : current
    )
  }
  const review = async (): Promise<void> => {
    const version = draftVersion.current
    const request = computerConfigurationRequest(draft)
    setPending('plan')
    setError(null)
    try {
      const result = await callRuntimeRpc<ComputerConfigurationPlanResult>(
        getActiveRuntimeTarget(settings),
        'computers.configuration.plan',
        {
          id: computerId,
          expectedRevision: snapshot.revision,
          expectedDesiredState: snapshot.desiredState,
          configuration: request
        }
      )
      if (version !== draftVersion.current) {
        return
      }
      if (result.outcome === 'conflict') {
        setError('This Computer changed elsewhere. Reload setup before continuing.')
        return
      }
      setReviewed({ plan: result.plan, request, draftVersion: version })
    } catch (planError) {
      setError(message(planError))
    } finally {
      setPending(null)
    }
  }
  const apply = async (): Promise<void> => {
    if (!reviewed?.plan.replacementRequired || reviewed.draftVersion !== draftVersion.current) {
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
          expectedDesiredState: snapshot.desiredState,
          configuration: reviewed.request
        }
      )
      if (result.outcome === 'conflict') {
        setError('This Computer changed elsewhere. Reload setup before continuing.')
        return
      }
      setReviewed(null)
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

  const plan = reviewed?.plan ?? null
  return (
    <div className="space-y-4">
      <ComputerResourceFields computerId={computerId} draft={draft} updateDraft={updateDraft} />

      <div className="space-y-2">
        <div>
          <p className="text-xs font-medium text-foreground">Environment</p>
          <p className="text-[11px] text-muted-foreground">
            Ordinary variables only. Existing values stay hidden; uncheck a name to remove or
            replace it.
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
          <div key={entry.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
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
              placeholder="Value (not a secret)"
              type="text"
              autoComplete="off"
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
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove variable ${entry.name || 'row'}`}
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
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
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
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove premounted folder ${index + 1}`}
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
      <div className="flex flex-wrap justify-end gap-2">
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
            {plan.interruption === 'restart' ? 'Apply & restart' : 'Apply setup'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
