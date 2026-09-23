import type { Run } from '../../shared/agent-roster'
import {
  MAX_MANAGED_PTY_EXIT_EVIDENCE_ITEMS,
  type ManagedPtyExitCertificateV1
} from '../../shared/managed-pty-exit-evidence'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import type { ManagedComputerConnection } from '../agents/managed-computer-host-projector'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import {
  captureRunExecutionIdentity,
  certificateMatchesManagedRun,
  managedPtyBelongsToConnection,
  managedRunExitCandidate,
  managedRunExitCandidateKey,
  parseManagedRunExecutionIdentity,
  runHasExecutionIdentity,
  type ManagedRunExecutionIdentity,
  type RunExecutionIdentity
} from './managed-run-execution-identity'

export class ManagedRunPtyExitObserver {
  private readonly unsubscribes = new Map<string, () => void>()
  private disposed = false

  constructor(
    private readonly roster: Pick<
      AgentRosterStore,
      'getRun' | 'transitionRunningRunToWaitingIfIdentity'
    >,
    private readonly runtime: Pick<DorkaRuntimeService, 'subscribeToPtyExit'>
  ) {}

  observe(runId: string, ptyId: string): void {
    const run = this.roster.getRun(runId)
    const identity = run ? captureRunExecutionIdentity(run) : null
    if (!identity) {
      return
    }
    this.unsubscribes.get(runId)?.()
    this.arm(runId, identity, ptyId)
  }

  async reconcileAfterConnect(
    connection: Pick<ManagedComputerConnection, 'connectionId' | 'durableExitEvidence'>,
    runs: readonly Run[],
    runtime: Pick<DorkaRuntimeService, 'getExactTerminalPtyId'>
  ): Promise<void> {
    if (this.disposed) {
      return
    }
    const offline = new Map<string, { run: Run; identity: ManagedRunExecutionIdentity }[]>()
    for (const run of runs) {
      if (!run.terminalSessionId || !run.processIdentity) {
        continue
      }
      const livePtyId = exactLivePtyId(runtime, run)
      if (livePtyId && managedPtyBelongsToConnection(livePtyId, connection.connectionId)) {
        if (run.status === 'running' || run.status === 'waiting') {
          this.observe(run.id, livePtyId)
        }
        continue
      }
      const identity = parseManagedRunExecutionIdentity(run, connection.connectionId)
      if (!identity) {
        continue
      }
      const key = managedRunExitCandidateKey(identity)
      const matches = offline.get(key) ?? []
      matches.push({ run, identity })
      offline.set(key, matches)
    }

    const durable = connection.durableExitEvidence
    if (!durable || offline.size === 0) {
      return
    }
    const exact: { run: Run; identity: ManagedRunExecutionIdentity }[] = []
    for (const matches of offline.values()) {
      const match = matches.length === 1 ? matches[0] : undefined
      if (match?.identity.run.computerExecutionGeneration === durable.generation) {
        exact.push(match)
      }
    }
    for (let offset = 0; offset < exact.length; offset += MAX_MANAGED_PTY_EXIT_EVIDENCE_ITEMS) {
      if (this.disposed) {
        return
      }
      const batch = exact.slice(offset, offset + MAX_MANAGED_PTY_EXIT_EVIDENCE_ITEMS)
      let certificates: ManagedPtyExitCertificateV1[]
      try {
        certificates = await durable.listExact(
          batch.map(({ identity }) => managedRunExitCandidate(identity))
        )
      } catch {
        continue
      }
      for (const certificate of certificates) {
        if (this.disposed) {
          return
        }
        const match = offline.get(managedRunExitCandidateKey(certificate))
        if (
          match?.length !== 1 ||
          !certificateMatchesManagedRun(certificate, match[0].identity, durable.generation)
        ) {
          continue
        }
        await this.projectThenAcknowledge(
          match[0].run,
          match[0].identity,
          certificate,
          durable.acknowledgeExact
        )
      }
    }
  }

  dispose(): void {
    this.disposed = true
    for (const unsubscribe of this.unsubscribes.values()) {
      unsubscribe()
    }
    this.unsubscribes.clear()
  }

  private async projectThenAcknowledge(
    run: Run,
    identity: ManagedRunExecutionIdentity,
    certificate: ManagedPtyExitCertificateV1,
    acknowledgeExact: (certificateId: string) => Promise<void>
  ): Promise<void> {
    try {
      if (run.status === 'running') {
        await this.roster.transitionRunningRunToWaitingIfIdentity(run.id, identity.run)
      }
      if (this.disposed) {
        return
      }
      const current = this.roster.getRun(run.id)
      if (
        !current ||
        !runHasExecutionIdentity(current, identity.run) ||
        current.status === 'queued' ||
        current.status === 'running'
      ) {
        return
      }
      await acknowledgeExact(certificate.certificateId)
    } catch (error) {
      console.error(`[dorkad] Failed to reconcile managed Run PTY exit for ${run.id}:`, error)
    }
  }

  private arm(runId: string, identity: RunExecutionIdentity, ptyId: string): void {
    if (this.disposed) {
      return
    }
    let notified = false
    const unsubscribe = this.runtime.subscribeToPtyExit(ptyId, (event) => {
      notified = true
      this.unsubscribes.delete(runId)
      if (!event.processDeathCertified) {
        this.arm(runId, identity, ptyId)
        return
      }
      void this.roster
        .transitionRunningRunToWaitingIfIdentity(runId, identity)
        .catch((error: unknown) => {
          console.error(`[dorkad] Failed to project managed Run PTY exit for ${runId}:`, error)
        })
    })
    if (!notified && !this.disposed) {
      this.unsubscribes.set(runId, unsubscribe)
    }
  }
}

function exactLivePtyId(
  runtime: Pick<DorkaRuntimeService, 'getExactTerminalPtyId'>,
  run: Run
): string | null {
  try {
    return runtime.getExactTerminalPtyId(run.terminalSessionId ?? '', run.processIdentity ?? '')
  } catch {
    return null
  }
}
