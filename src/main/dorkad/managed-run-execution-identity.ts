import type { Run } from '../../shared/agent-roster'
import {
  isManagedExecutionUuid,
  type ManagedPtyExitCandidate,
  type ManagedPtyExitCertificateV1
} from '../../shared/managed-pty-exit-evidence'
import { parseAppSshPtyId } from '../../shared/ssh-pty-id'

export type RunExecutionIdentity = Readonly<
  Pick<Run, 'computerId' | 'computerExecutionGeneration'> & {
    terminalSessionId: string
    processIdentity: string
  }
>

export type ManagedRunExecutionIdentity = Readonly<{
  run: RunExecutionIdentity & {
    computerExecutionGeneration: string
    terminalSessionId: string
    processIdentity: string
  }
  relayGeneration: string
  relayPtyId: string
  ptyIncarnationId: string
}>

export function captureRunExecutionIdentity(run: Run): RunExecutionIdentity | null {
  if (!run.terminalSessionId || !run.processIdentity) {
    return null
  }
  return {
    computerId: run.computerId,
    computerExecutionGeneration: run.computerExecutionGeneration,
    terminalSessionId: run.terminalSessionId,
    processIdentity: run.processIdentity
  }
}

export function runHasExecutionIdentity(run: Run, expected: RunExecutionIdentity): boolean {
  return (
    run.computerId === expected.computerId &&
    run.computerExecutionGeneration === expected.computerExecutionGeneration &&
    run.terminalSessionId === expected.terminalSessionId &&
    run.processIdentity === expected.processIdentity
  )
}

export function parseManagedRunExecutionIdentity(
  run: Run,
  expectedConnectionId: string
): ManagedRunExecutionIdentity | null {
  const identity = captureRunExecutionIdentity(run)
  if (!identity?.computerExecutionGeneration) {
    return null
  }
  const incarnationMatch = identity.processIdentity.match(
    /:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  )
  if (!incarnationMatch || !isManagedExecutionUuid(incarnationMatch[1])) {
    return null
  }
  const appPtyId = identity.processIdentity.slice(0, -incarnationMatch[0].length)
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
    run: {
      ...identity,
      computerExecutionGeneration: identity.computerExecutionGeneration,
      terminalSessionId: identity.terminalSessionId,
      processIdentity: identity.processIdentity
    },
    relayPtyId: parsed.relayPtyId,
    ptyIncarnationId: incarnationMatch[1],
    relayGeneration
  }
}

export function managedRunExitCandidate(
  identity: ManagedRunExecutionIdentity
): ManagedPtyExitCandidate {
  return {
    relayPtyId: identity.relayPtyId,
    ptyIncarnationId: identity.ptyIncarnationId
  }
}

export function managedPtyBelongsToConnection(ptyId: string, connectionId: string): boolean {
  return parseAppSshPtyId(ptyId)?.connectionId === connectionId
}

export function managedRunExitCandidateKey(candidate: ManagedPtyExitCandidate): string {
  return `${candidate.relayPtyId}\0${candidate.ptyIncarnationId}`
}

export function certificateMatchesManagedRun(
  certificate: ManagedPtyExitCertificateV1,
  identity: ManagedRunExecutionIdentity,
  connectedGeneration: string
): boolean {
  return (
    certificate.version === 1 &&
    connectedGeneration === identity.run.computerExecutionGeneration &&
    certificate.computerExecutionGeneration === identity.run.computerExecutionGeneration &&
    certificate.relayPtyId === identity.relayPtyId &&
    certificate.ptyIncarnationId === identity.ptyIncarnationId &&
    certificate.relayGeneration === identity.relayGeneration
  )
}
