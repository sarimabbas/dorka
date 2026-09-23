import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import type { Agent, AgentCreate } from '../../../../shared/agent-roster'
import { getAgentCatalog } from '@/lib/agent-catalog'
import {
  AgentRosterUnsupportedError,
  createRuntimeAgentPreset,
  getRuntimeAgentReferencesCapability,
  listRuntimeAgentPresets,
  type AgentReferencesCapability
} from '@/runtime/runtime-agent-roster-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { AgentPresetRow } from './AgentPresetLaunchForm'
import { SettingsSubsectionHeader } from './SettingsFormControls'

type AgentPresetDraft = {
  name: string
  job: string
  harnessId: string
  promptTemplate: string
  model: string
  workingDirectory: string
}

const EMPTY_DRAFT: AgentPresetDraft = {
  name: '',
  job: '',
  harnessId: 'claude',
  promptTemplate: '',
  model: '',
  workingDirectory: ''
}

function errorMessage(error: unknown): string {
  if (error instanceof AgentRosterUnsupportedError) {
    return error.message
  }
  return error instanceof Error && error.message ? error.message : 'Agents could not be loaded.'
}

function buildCreateRequest(draft: AgentPresetDraft): AgentCreate {
  const model = draft.model.trim()
  const workingDirectory = draft.workingDirectory.trim()
  return {
    name: draft.name.trim(),
    character: { color: 'violet', variant: 'orb' },
    job: draft.job.trim(),
    harnessId: draft.harnessId,
    promptTemplate: draft.promptTemplate.trim(),
    ...(model ? { model } : {}),
    ...(workingDirectory ? { workingDirectory } : {})
  }
}

export function AgentPresetsSection({
  target
}: {
  target: RuntimeClientTarget
}): React.JSX.Element {
  const [presets, setPresets] = useState<Agent[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [requirementsCapability, setRequirementsCapability] = useState<
    AgentReferencesCapability | 'checking'
  >('checking')
  const [draft, setDraft] = useState<AgentPresetDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const environmentId = target.kind === 'environment' ? target.environmentId : null

  const load = async (): Promise<void> => {
    setLoadError(null)
    setUnsupported(false)
    setRequirementsCapability('checking')
    try {
      const runtimeTarget: RuntimeClientTarget = environmentId
        ? { kind: 'environment', environmentId }
        : { kind: 'local' }
      const [loaded, capability] = await Promise.all([
        listRuntimeAgentPresets(runtimeTarget),
        getRuntimeAgentReferencesCapability(runtimeTarget)
      ])
      setRequirementsCapability(capability)
      setPresets(loaded)
    } catch (error) {
      setPresets(null)
      setUnsupported(error instanceof AgentRosterUnsupportedError)
      setLoadError(errorMessage(error))
    }
  }

  const reloadPreset = async (agentId: string): Promise<Agent | undefined> => {
    const runtimeTarget: RuntimeClientTarget = environmentId
      ? { kind: 'environment', environmentId }
      : { kind: 'local' }
    const loaded = await listRuntimeAgentPresets(runtimeTarget)
    setPresets(loaded)
    return loaded.find((agent) => agent.id === agentId)
  }

  useEffect(() => {
    let active = true
    setPresets(null)
    setDraft(null)
    setLoadError(null)
    setUnsupported(false)
    setRequirementsCapability('checking')
    const runtimeTarget: RuntimeClientTarget = environmentId
      ? { kind: 'environment', environmentId }
      : { kind: 'local' }
    void Promise.all([
      listRuntimeAgentPresets(runtimeTarget),
      getRuntimeAgentReferencesCapability(runtimeTarget)
    ])
      .then(([loaded, capability]) => {
        if (active) {
          setPresets(loaded)
          setRequirementsCapability(capability)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setUnsupported(error instanceof AgentRosterUnsupportedError)
          setLoadError(errorMessage(error))
        }
      })
    return () => {
      active = false
    }
  }, [environmentId])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!draft || saving) {
      return
    }
    const request = buildCreateRequest(draft)
    if (!request.name || !request.job || !request.promptTemplate) {
      setSaveError('Name, job, and prompt are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const created = await createRuntimeAgentPreset(
        environmentId ? { kind: 'environment', environmentId } : { kind: 'local' },
        request
      )
      setPresets((current) => [...(current ?? []), created])
      setDraft(null)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const catalog = getAgentCatalog()

  return (
    <section className="space-y-4">
      <SettingsSubsectionHeader
        title="Agents"
        description="Create reusable agent configurations and launch them on a Computer."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unsupported || presets === null || draft !== null}
            onClick={() => {
              setSaveError(null)
              setDraft({ ...EMPTY_DRAFT })
            }}
          >
            <Plus className="size-3.5" />
            New agent
          </Button>
        }
      />

      {loadError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{loadError}</span>
          {!unsupported ? (
            <Button type="button" variant="outline" size="xs" onClick={() => void load()}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {requirementsCapability === 'unverifiable' && presets ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>Requirements support could not be verified.</span>
          <Button type="button" variant="outline" size="xs" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {draft ? (
        <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-preset-name">Name</Label>
              <Input
                id="agent-preset-name"
                autoFocus
                required
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Release reviewer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-preset-job">Job</Label>
              <Input
                id="agent-preset-job"
                required
                value={draft.job}
                onChange={(event) => setDraft({ ...draft, job: event.target.value })}
                placeholder="Review changes before release"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-preset-harness">Agent app</Label>
              <Select
                value={draft.harnessId}
                onValueChange={(harnessId) => setDraft({ ...draft, harnessId })}
              >
                <SelectTrigger id="agent-preset-harness" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-preset-model">Model</Label>
              <Input
                id="agent-preset-model"
                value={draft.model}
                onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="agent-preset-working-directory">Working directory</Label>
              <Input
                id="agent-preset-working-directory"
                className="font-mono"
                value={draft.workingDirectory}
                onChange={(event) => setDraft({ ...draft, workingDirectory: event.target.value })}
                placeholder="Optional path"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="agent-preset-prompt">Prompt</Label>
              <Textarea
                id="agent-preset-prompt"
                required
                value={draft.promptTemplate}
                onChange={(event) => setDraft({ ...draft, promptTemplate: event.target.value })}
                placeholder="Describe the task and expected result."
              />
            </div>
          </div>
          {saveError ? (
            <p role="alert" className="text-xs text-destructive">
              {saveError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Creating…' : 'Create agent'}
            </Button>
          </div>
        </form>
      ) : null}

      {presets === null && !loadError ? (
        <p className="text-sm text-muted-foreground">Loading agents…</p>
      ) : presets?.length === 0 && !draft ? (
        <p className="rounded-xl border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
          No agents yet.
        </p>
      ) : presets && presets.length > 0 ? (
        <div className="divide-y divide-border rounded-xl border border-border">
          {presets.map((preset) => (
            <AgentPresetRow
              key={preset.id}
              preset={preset}
              target={target}
              requirementsCapability={requirementsCapability}
              onPresetUpdated={(updated) =>
                setPresets(
                  (current) =>
                    current?.map((agent) => (agent.id === updated.id ? updated : agent)) ?? null
                )
              }
              onReloadPreset={() => reloadPreset(preset.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
