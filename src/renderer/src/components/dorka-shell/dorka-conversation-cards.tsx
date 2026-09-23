import { Check, ChevronRight, CircleCheck, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export function JobCard({ accepted, onAccept }: { accepted: boolean; onAccept: () => void }) {
  return (
    <section
      aria-label="Suggested job"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-muted p-2 text-foreground">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Prepare the 1.5 release</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Review the open checks, draft release notes, and flag anything that blocks publishing.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Suggested job</Badge>
            <span className="text-xs text-muted-foreground">About 12 minutes</span>
          </div>
        </div>
        <Button
          size="sm"
          variant={accepted ? 'secondary' : 'default'}
          onClick={onAccept}
          disabled={accepted}
        >
          {accepted ? <Check /> : <ChevronRight />}
          {accepted ? 'Accepted' : 'Start'}
        </Button>
      </div>
    </section>
  )
}

export function CapabilityCard({
  approved,
  onApprove
}: {
  approved: boolean
  onApprove: () => void
}) {
  return (
    <section
      aria-label="Capability request"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-muted p-2 text-foreground">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Repository write access</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Mara needs permission to update the release notes in this workspace.
          </p>
        </div>
        <Button
          size="sm"
          variant={approved ? 'secondary' : 'outline'}
          onClick={onApprove}
          disabled={approved}
        >
          {approved ? <Check /> : null}
          {approved ? 'Approved' : 'Review'}
        </Button>
      </div>
    </section>
  )
}

export function ProgressCard(): React.JSX.Element {
  return (
    <section
      aria-label="Job progress"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Release readiness</h3>
          <p className="mt-1 text-xs text-muted-foreground">Running checks on Computer</p>
        </div>
        <span className="text-sm font-semibold tabular-nums">68%</span>
      </div>
      <Progress value={68} aria-label="Release readiness progress" />
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <CircleCheck className="size-3.5 text-status-success" /> 2 of 3 steps complete
      </div>
    </section>
  )
}
