import type { ComputerConfigurationPlan } from '../../../../shared/computer-runtime'

export function ComputerConfigurationPlanSummary({
  plan
}: {
  plan: ComputerConfigurationPlan
}): React.JSX.Element {
  const changes = [
    ...plan.changes.resources.map((name) => `Change ${name}`),
    ...plan.changes.environment.added.map((name) => `Add ${name}`),
    ...plan.changes.environment.changed.map((name) => `Replace ${name}`),
    ...plan.changes.environment.removed.map((name) => `Remove ${name}`),
    ...(plan.changes.premountsChanged ? ['Change premounted folders'] : [])
  ]
  return (
    <div className="rounded-md border border-border bg-background p-3 text-xs">
      <p className="font-medium">{changes.length > 0 ? 'Ready to apply' : 'No changes'}</p>
      {changes.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
          {changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      ) : null}
      {plan.interruption === 'restart' ? (
        <p className="mt-2 text-amber-600 dark:text-amber-400">
          Applying this setup restarts the Computer. Running processes will stop.
        </p>
      ) : null}
    </div>
  )
}
