import { useId, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import {
  AgentReferenceSetSchema,
  type Agent,
  type AgentReference,
  type AgentReferenceSet
} from '../../../../shared/agent-roster'
import { MCP_CONFIG_CANDIDATES } from '../../../../shared/mcp-config'
import { updateRuntimeAgentReferences } from '@/runtime/runtime-agent-roster-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

type DraftKind = AgentReference['kind']

export function AgentRequirementsEditor({
  preset,
  target,
  onClose,
  onUpdated,
  onReload
}: {
  preset: Agent
  target: RuntimeClientTarget
  onClose: () => void
  onUpdated: (agent: Agent) => void
  onReload: () => Promise<Agent | undefined>
}): React.JSX.Element {
  const nameId = useId()
  const [references, setReferences] = useState<AgentReferenceSet>(preset.references)
  const [expectedRevision, setExpectedRevision] = useState(preset.revision)
  const [kind, setKind] = useState<DraftKind>('skill')
  const [name, setName] = useState('')
  const [qualifier, setQualifier] = useState('either')
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = (): void => {
    const reference: AgentReference =
      kind === 'skill'
        ? { kind, name, scope: qualifier as 'global' | 'workspace' | 'either' }
        : {
            kind,
            name,
            configId: qualifier as 'workspace' | 'cursor' | 'claude-root' | 'claude-workspace'
          }
    const parsed = AgentReferenceSetSchema.safeParse({
      version: 1,
      items: [...references.items, reference]
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the requirement.')
      return
    }
    setReferences(parsed.data)
    setName('')
    setError(null)
  }

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const parsed = AgentReferenceSetSchema.safeParse(references)
    if (!parsed.success || saving) {
      setError(
        parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check the requirements.')
      )
      return
    }
    setSaving(true)
    setError(null)
    setConflict(false)
    try {
      const result = await updateRuntimeAgentReferences(target, {
        agentId: preset.id,
        expectedRevision,
        references: parsed.data
      })
      if (result.outcome === 'conflict') {
        setConflict(true)
        return
      }
      onUpdated(result.agent)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Requirements could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const reload = async (): Promise<void> => {
    try {
      const latest = await onReload()
      if (!latest) {
        setError('This Agent could not be reloaded.')
        return
      }
      setReferences(latest.references)
      setExpectedRevision(latest.revision)
      setConflict(false)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This Agent could not be reloaded.')
    }
  }

  return (
    <form className="space-y-3 border-t border-border bg-muted/30 px-3 py-3" onSubmit={save}>
      <div className="space-y-2">
        {references.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No requirements. This Agent can launch anywhere.
          </p>
        ) : (
          references.items.map((reference, index) => (
            <div
              key={`${reference.kind}:${reference.name}:${index}`}
              className="flex items-center gap-2 text-xs"
            >
              <span className="w-20 shrink-0 text-muted-foreground">
                {reference.kind === 'skill' ? 'Skill' : 'MCP server'}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{reference.name}</span>
              <span className="text-muted-foreground">
                {reference.kind === 'skill'
                  ? reference.scope
                  : MCP_CONFIG_CANDIDATES.find(({ id }) => id === reference.configId)?.label}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${reference.name}`}
                onClick={() =>
                  setReferences({
                    version: 1,
                    items: references.items.filter((_, itemIndex) => itemIndex !== index)
                  })
                }
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_10rem_auto]">
        <Select
          value={kind}
          onValueChange={(value: DraftKind) => {
            setKind(value)
            setQualifier(value === 'skill' ? 'either' : 'workspace')
          }}
        >
          <SelectTrigger aria-label="Requirement type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skill">Skill</SelectItem>
            <SelectItem value="mcp-server">MCP server</SelectItem>
          </SelectContent>
        </Select>
        <div>
          <Label htmlFor={nameId} className="sr-only">
            Requirement name
          </Label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === 'skill' ? 'code-review' : 'linear'}
          />
        </div>
        <Select value={qualifier} onValueChange={setQualifier}>
          <SelectTrigger aria-label={kind === 'skill' ? 'Skill scope' : 'MCP configuration'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kind === 'skill' ? (
              <>
                <SelectItem value="either">Either</SelectItem>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="workspace">Workspace</SelectItem>
              </>
            ) : (
              MCP_CONFIG_CANDIDATES.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Add
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Names are checked on the selected Computer. Do not enter paths or secrets.
      </p>
      {conflict ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 text-xs text-destructive"
        >
          <span>This Agent changed elsewhere. Reload requirements before continuing.</span>
          <Button type="button" variant="outline" size="xs" onClick={() => void reload()}>
            Reload
          </Button>
        </div>
      ) : error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
