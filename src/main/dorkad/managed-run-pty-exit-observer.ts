import type { AgentRosterStore } from '../agents/agent-roster-store'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'

export class ManagedRunPtyExitObserver {
  private readonly unsubscribes = new Map<string, () => void>()
  private disposed = false

  constructor(
    private readonly roster: Pick<AgentRosterStore, 'transitionRunningRunToWaiting'>,
    private readonly runtime: Pick<DorkaRuntimeService, 'subscribeToPtyExit'>
  ) {}

  observe(runId: string, ptyId: string): void {
    this.unsubscribes.get(runId)?.()
    this.arm(runId, ptyId)
  }

  dispose(): void {
    this.disposed = true
    for (const unsubscribe of this.unsubscribes.values()) {
      unsubscribe()
    }
    this.unsubscribes.clear()
  }

  private arm(runId: string, ptyId: string): void {
    if (this.disposed) {
      return
    }
    let notified = false
    const unsubscribe = this.runtime.subscribeToPtyExit(ptyId, (event) => {
      notified = true
      this.unsubscribes.delete(runId)
      if (!event.processDeathCertified) {
        this.arm(runId, ptyId)
        return
      }
      void this.roster.transitionRunningRunToWaiting(runId).catch((error: unknown) => {
        console.error(`[dorkad] Failed to project managed Run PTY exit for ${runId}:`, error)
      })
    })
    if (!notified && !this.disposed) {
      this.unsubscribes.set(runId, unsubscribe)
    }
  }
}
