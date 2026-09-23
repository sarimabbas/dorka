import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ComputerConfigurationDraft } from './computer-configuration-draft'

export function ComputerResourceFields({
  computerId,
  draft,
  updateDraft
}: {
  computerId: string
  draft: ComputerConfigurationDraft
  updateDraft: (update: (current: ComputerConfigurationDraft) => ComputerConfigurationDraft) => void
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Resources</p>
      <div className="grid gap-2 sm:grid-cols-3">
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
  )
}
