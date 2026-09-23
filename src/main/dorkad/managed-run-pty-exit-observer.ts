import type { Run } from '../../shared/agent-roster'
import {
  MAX_MANAGED_PTY_EXIT_EVIDENCE_ITEMS,
  isManagedExecutionUuid,
  type ManagedPtyExitCandidate,
  type ManagedPtyExitCertificateV1
} from '../../shared/managed-pty-exit-evidence'
import { parseAppSshPtyId } from '../../shared/ssh-pty-id'
import type { AgentRosterStore } from '../agents/agent-roster-store'
import type { ManagedComputerConnection } from '../agents/managed-computer-host-projector'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'

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
    if (!run?.terminalSessionId || !run.processIdentity) {
      return
    }
    this.unsubscribes.get(runId)?.()
    this.arm(run, ptyId)
  }

  async reconcileAfterConnect(
    connection: Pick<ManagedComputerConnection, 'connectionId' | 'durableExitEvidence'>,
    runs: readonly Run[],
    runtime: Pick<DorkaRuntimeService, 'getExactTerminalPtyId'>
  ): Promise<void> {
    if (this.disposed) {
      return
    }
    const offline = new Map<string, { run: Run; identity: ManagedRunPtyIdentity }[]>()
    for (const run of runs) {
      if (!run.terminalSessionId || !run.processIdentity) {
        continue
      }
      const livePtyId = exactLivePtyId(runtime, run)
      if (livePtyId && belongsToConnection(livePtyId, connection.connectionId)) {
        if (run.status === 'running' || run.status === 'waiting') {
          this.observe(run.id, livePtyId)
        }
        continue
      }
      const identity = parseManagedRunPtyIdentity(run.processIdentity, connection.connectionId)
      if (!identity || !run.computerExecutionGeneration) {
        continue
      }
      const key = candidateKey(identity)
      const matches = offline.get(key) ?? []
      matches.push({ run, identity })
      offline.set(key, matches)
    }

    const durable = connection.durableExitEvidence
    if (!durable || offline.size === 0) {
      return
    }
    const exact: { run: Run; identity: ManagedRunPtyIdentity }[] = []
    for (const matches of offline.values()) {
      const match = matches.length === 1 ? matches[0] : undefined
      if (match?.run.computerExecutionGeneration === durable.generation) {
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
        certificates = await durable.listExact(batch.map(({ identity }) => identity))
      } catch {
        continue
      }
      for (const certificate of certificates) {
        if (this.disposed) {
          return
        }
        const match = offline.get(candidateKey(certificate))
        if (
          match?.length !== 1 ||
          !certificateMatches(certificate, match[0].run, match[0].identity, durable.generation)
        ) {
          continue
        }
        await this.projectThenAcknowledge(match[0].run, certificate, durable.acknowledgeExact)
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
    certificate: ManagedPtyExitCertificateV1,
    acknowledgeExact: (certificateId: string) => Promise<void>
  ): Promise<void> {
    try {
      if (run.status === 'running') {
        await this.roster.transitionRunningRunToWaitingIfIdentity(run.id, runIdentity(run))
      }
      if (this.disposed) {
        return
      }
      const current = this.roster.getRun(run.id)
      if (
        !current ||
        current.computerId !== run.computerId ||
        current.computerExecutionGeneration !== run.computerExecutionGeneration ||
        current.terminalSessionId !== run.terminalSessionId ||
        current.processIdentity !== run.processIdentity ||
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

  private arm(run: Run, ptyId: string): void {
    if (this.disposed) {
      return
    }
    let notified = false
    const unsubscribe = this.runtime.subscribeToPtyExit(ptyId, (event) => {
      notified = true
      this.unsubscribes.delete(run.id)
      if (!event.processDeathCertified) {
        this.arm(run, ptyId)
        return
      }
      void this.roster
        .transitionRunningRunToWaitingIfIdentity(run.id, runIdentity(run))
        .catch((error: unknown) => {
          console.error(`[dorkad] Failed to project managed Run PTY exit for ${run.id}:`, error)
        })
    })
    if (!notified && !this.disposed) {
      this.unsubscribes.set(run.id, unsubscribe)
    }
  }
}

type ManagedRunPtyIdentity = ManagedPtyExitCandidate & { relayGeneration: string }
type RunIdentity = Pick<
  Run,
  'computerId' | 'computerExecutionGeneration' | 'terminalSessionId' | 'processIdentity'
>

function runIdentity(run: Run): RunIdentity {
  return {
    computerId: run.computerId,
    computerExecutionGeneration: run.computerExecutionGeneration,
    terminalSessionId: run.terminalSessionId,
    processIdentity: run.processIdentity
  }
}

export function parseManagedRunPtyIdentity(
  processIdentity: string,
  expectedConnectionId: string
): ManagedRunPtyIdentity | null {
  const incarnationMatch = processIdentity.match(
    /:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  )
  if (!incarnationMatch || !isManagedExecutionUuid(incarnationMatch[1])) {
    return null
  }
  const appPtyId = processIdentity.slice(0, -incarnationMatch[0].length)
  const parsed = parseAppSshPtyId(appPtyId)
  if (!parsed || parsed.connectionId !== expectedConnectionId) {
    return null
  }
  const relayMatch = parsed.relayPtyId.match(/^pty2:([^:]+):(0|[1-9][0-9]*)$/)
  if (!relayMatch) {
    return null
  }
  let relayGeneration: string
  try {
    relayGeneration = decodeURIComponent(relayMatch[1] ?? '')
  } catch {
    return null
  }
  if (
    !isManagedExecutionUuid(relayGeneration) ||
    encodeURIComponent(relayGeneration) !== relayMatch[1]
  ) {
    return null
  }
  return {
    relayPtyId: parsed.relayPtyId,
    ptyIncarnationId: incarnationMatch[1],
    relayGeneration
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

function belongsToConnection(ptyId: string, connectionId: string): boolean {
  return parseAppSshPtyId(ptyId)?.connectionId === connectionId
}

function candidateKey(candidate: ManagedPtyExitCandidate): string {
  return `${candidate.relayPtyId}\0${candidate.ptyIncarnationId}`
}

function certificateMatches(
  certificate: ManagedPtyExitCertificateV1,
  run: Run,
  identity: ManagedRunPtyIdentity,
  generation: string
): boolean {
  return (
    certificate.version === 1 &&
    certificate.computerExecutionGeneration === generation &&
    run.computerExecutionGeneration === generation &&
    certificate.relayPtyId === identity.relayPtyId &&
    certificate.ptyIncarnationId === identity.ptyIncarnationId &&
    certificate.relayGeneration === identity.relayGeneration
  )
}
