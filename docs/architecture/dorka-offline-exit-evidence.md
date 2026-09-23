# Durable managed PTY exit evidence

## Decision

When a managed PTY exits while the Dorka Server is offline, store a durable exit certificate inside
the Computer's persistent home volume. The incumbent relay authors the certificate because it owns
the PTY and observes host-local process death.

Do not infer death from PTY absence, SSH disconnect, a failed reattach, container state, missing
journal data, or volume loss. Those cases remain `unverifiable`.

```text
Relay observes certified PTY death
  -> crash-durable certificate in Computer home volume
  -> Server reconnects through existing SSH relay
  -> capability-gated exact certificate read
  -> generation + PTY ID + incarnation validation
  -> durable Run running -> waiting
  -> acknowledge certificate
```

This design extends the existing relay request/response channel. It does not introduce another PTY
transport, lifecycle store, process supervisor, or Computer-side product agent.

## Evidence authority

Use a stable path outside content-hashed relay installations:

```text
/home/ubuntu/.dorka/managed-pty-exits/v1/
  pending/<certificate-id>.json
  acknowledged/<certificate-id>.json
```

Server storage cannot be the original authority because the Server is absent during the event.
Existing SSH leases describe routing and reattachment. Their absence or expiry does not prove process
death. Relay memory also cannot bridge relay restart or a long Server outage.

Only these existing host observations may write a certificate:

1. the physical `node-pty` exit callback;
2. the existing host-local proven-process-absent reap path.

Map misses, disconnect cleanup, attach timeout, unmarked not-found, inventory absence, and lease expiry
must write nothing.

## Exact identity fence

Add an immutable random `executionGeneration` when a Computer record is first created. Persist it in:

- the Server's Computer record;
- an immutable container label and root-authored marker readable by the relay;
- each newly launched Run as optional `computerExecutionGeneration`;
- every exit certificate.

Start, stop, reconciliation, and ordinary replacement preserve the generation. Deleting and
recreating a Computer, explicitly accepting a changed host identity, or explicitly replacing its
persistent volume creates a new generation.

Legacy Runs without a launch-time generation cannot consume offline certificates. They retain exact
live PTY reattachment and observer re-arming. Never backfill their generation from the Computer's
current value.

A version-1 certificate contains:

```ts
type ManagedPtyExitCertificateV1 = {
  version: 1
  certificateId: string
  computerExecutionGeneration: string
  relayGeneration: string
  relayPtyId: string
  ptyIncarnationId: string
  exitCode: number
  observedAt: number // diagnostic only
  evidence: 'node-pty-exit' | 'host-process-absent'
}
```

The deterministic certificate ID covers generation, full relay PTY ID, and incarnation. Wall-clock
time never selects or orders process identity.

## Journal and wire protocol

Write each certificate through a temporary file, file sync, atomic rename, and directory sync before
removing the relay's PTY record. A journal write failure does not weaken an online exit event. It means
later offline recovery lacks evidence and remains unverifiable.

Add two capability-gated methods to the existing relay dispatcher:

```text
pty.listExitEvidenceV1
pty.ackExitEvidenceV1
```

Advertise `durableExitEvidenceVersion: 1` as an additive PTY capability. Do not replay old events as
unsolicited `pty.exit` frames. Explicit list/ack requests preserve mixed-version behavior and avoid a
race before the Run observer is armed.

List requests contain the Computer execution generation and a bounded set of exact PTY ID/incarnation
candidates. The relay returns only exact matches. An empty response does not establish either live or
exited.

## Projection and acknowledgement

Deepen the existing managed Run exit observer to own live observation and reconnect reconciliation:

```ts
observeLive(runId, ptyId): void
reconcileAfterConnect(computerId, runs): Promise<ReconcileResult>
dispose(): void
```

For every exact certificate:

1. verify Computer ID, execution generation, full PTY ID, and incarnation;
2. durably call the existing idempotent `transitionRunningRunToWaiting` projection;
3. acknowledge only after persistence commits.

A persistence failure leaves the certificate pending. An acknowledgement timeout causes harmless
at-least-once replay. Terminal Run states remain unchanged. A duplicate certificate for an already
settled exact Run may be acknowledged.

Keep unacknowledged certificates until acknowledged or explicit Computer-volume deletion. Retain
acknowledged certificates briefly for diagnostics, then prune. Capacity exhaustion must report a
degraded journal; it must not silently delete pending evidence and make absence appear authoritative.

## Trust loss and compatibility

A changed SSH host key blocks connection, certificate reads, and reattachment. Runs remain
unverifiable until explicit operator re-adoption, which advances the Computer execution generation.

A missing, corrupt, unsupported, or unreadable journal is no evidence. Computer home-volume
replacement advances the generation. Server-volume loss does not let a new Run inherit old
certificates.

Compatibility behavior:

- **Old relay, new Server:** capability absent; skip list/ack and retain current live reattach behavior.
- **New relay, old Server:** keep certificates pending; emit no unsolicited replay frames.
- **Old client, new Server:** no client protocol change is required; Run status remains the projection.
- **Legacy Run:** no generation means no offline replay.

## Implementation status

Completed prerequisites:

- Commit `1a22d157b` adds immutable Computer execution generations, migrates legacy Computer records
  once, preserves generations across lifecycle and reconciliation, writes the engine label and
  root-authored Computer marker, and snapshots the generation onto every new Run. Legacy Runs remain
  unset and are never backfilled.
- Commit `e3ddb0d54` adds the standalone relay journal. It provides strict version-1 certificates,
  deterministic IDs, same-filesystem no-clobber publication, file and directory sync, bounded exact
  reads, corruption quarantine, and idempotent acknowledgement that converges crash residue.

The journal is deliberately not yet composed into `PtyHandler`, relay capabilities, or managed Run
recovery. Its presence alone is not exit evidence and does not change Run status.

## Delivery slice and forecast

Remaining focused vertical slice:

1. compose one journal under the stable Computer-home path and write only from certified relay exit
   paths;
2. add capability-gated exact list/ack relay methods;
3. add projection-before-ack reconciliation to the existing managed exit module;
4. add mixed-version and fault-injection tests;
5. run native-Linux outage E2E using only disposable repositories and Computer volumes.

The remaining implementation is estimated at **2–4 engineering days**. The P0 gate stays open until
exact Run projection and native-Linux outage evidence pass.
