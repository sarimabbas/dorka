# Dorka deep-module review

## Scope and verdict

This review covers the Agent, Run, Computer, and Server vertical slice through `1a3755ba6`. It applies
Ousterhout's deep-module criteria: information hiding, interface leverage, temporal coupling, policy
ownership, error vocabulary, and deletion opportunity.

The lifecycle modules hide useful policy, but the top-level ownership is wrong for the target product.
The current `AgentExecutionService` launches the provider process in the Computer and resolves skill/MCP
requirements there. The corrected boundary keeps Agent/provider processes, provider credentials, and
global skills/MCP on the control plane. The Computer owns workspace, packages, Git/SSH identity,
environment, secrets, and desktop, reached only through a managed execution adapter. This is the
controlled-beta blocker; existing tests prove transitional mechanics, not corrected acceptance.

```text
Renderer domain clients
  -> authenticated runtime RPC
  -> control plane
       -> AgentRosterStore
       -> provider process + PTY
       -> provider credentials + global skills/MCP
       -> AgentExecutionService
            -> managed execution adapter
                 -> Computer workspace/packages/Git+SSH/env/secrets/desktop
       -> ComputerRuntimeManager
       -> ComputerRunSourceControl
```

Do not create a second transport, store, Git adapter, or execution model. Deepen `AgentExecutionService`
so provider ownership stays on the control plane and Computer work delegates through the existing
managed connection seam.

## Completed during the review

### Run source placement has one authority

Commit `35aca87ad` resolves and persists the Run source directory before launch, then passes that exact
snapshot to the managed terminal launcher. The launcher no longer reinterprets mutable Agent
configuration.

```text
Agent workingDirectory
  -> resolve once
  -> Run.sourceDirectory
  -> AgentTerminalLaunch.sourceDirectory
  -> managed PTY cwd
```

This removed duplicated placement policy and a shallow `resolveComputerCwd` re-export.

### Managed Computer connections hide SSH topology

Commit `4a0d160b8` replaces the raw `SshTarget` result with a narrow managed connection containing
only the existing execution-host identity, connection ID, and incumbent Git capability. Private key
paths, target construction, session establishment, and provider registration remain inside the
projector. Source control and Git identity no longer repeat global provider lookups.

### Persisted Runs re-arm exact PTY observation

Commit `f27686310` reconnects each already-running Computer once, verifies the recovered terminal
handle against the exact persisted process identity, checks that the PTY belongs to the Run's Computer,
and re-arms the existing exit observer for every eligible Run. Colon-bearing relay PTY IDs are resolved
through runtime authority rather than delimiter guessing.

Missing handles, replaced incarnations, stopped Computers, reattach failure, and unverifiable contact do
not mutate or relaunch Runs. This closes observer reconstruction for PTYs that can be authoritatively
reattached. It does not manufacture evidence for an exit that happened while the Server was absent.

### Exact managed Run identity has one authority

Commit `876b1dd11` centralizes the immutable Computer, generation, terminal, process, relay, and PTY
incarnation fence. The module projects only `{ relayPtyId, ptyIncarnationId }` onto the strict evidence
wire contract while retaining relay generation for certificate verification. This removed duplicated
parsing and fixed an extra-field request that the strict relay validator rejected. Native commit
`33ca26073` proves projection-before-ack and failed-ack replay end to end.

### Computer configuration is deep and redacted

Commits `65e2fb4f7`, `8905ebdb6`, and `09bd41365` add one configuration module inside the existing
manager/store cluster. The opaque revision is the durable execution generation. `get` returns normalized
resources, environment names, and premounts. `plan` names changes without values. `replace` compares the
revision under the existing cross-process record lock, treats no-ops as no-ops, recreates through the
fixed engine template, and rotates the generation. The RPC is additive and capability-negotiated.

### Computer setup binds review, lifecycle, and recovery

Commits `912b29d66`, `aa244a8d5`, and `97f7a6367` expose the existing deep configuration seam without
a second persistence or engine path. The renderer ignores stale plans and applies the immutable request
that produced the visible plan. The Server checks both execution generation and desired lifecycle state
under the record lock, so `plan(stopped) → start → replace` conflicts instead of silently interrupting a
running Computer. If a normal engine command fails after replacement starts, the manager reconciles the
durable record before returning the error. Environment output remains names-only and the UI labels the
input as ordinary, non-secret configuration.

### Agent references are portable and fail closed under the transitional placement

Commits `09c4e4384` through `e2ee00657` add a strict names-only reference set without storing paths,
commands, URLs, environment, credentials, or package data on the Agent. Lazy v1→v2 migration,
revision-fenced updates, and `createRunForAgent` atomically snapshot the latest durable revision.

The composed resolver currently uses the Computer's SSH filesystem provider for skill discovery and MCP
inspection. Its fencing, bounded reads, CAS, capability honesty, and failure semantics remain useful
evidence. Computer-local resolution is not corrected acceptance. Global skill/MCP resolution and
execution must move to the control plane, while workspace packages remain Computer-owned.

### Premount authorization has one honest policy boundary

Commit `ff6d9d962` centralizes exact lexical source authorization in
`ComputerMountSourcePolicy` and applies it during planning, replacement, and final engine creation.
This removes duplicated checks and prevents a reviewed request from bypassing the runtime guard.
The policy deliberately does not call Server-container `realpath()` authoritative: Docker resolves bind
sources in the engine-host namespace. Operators must attest canonical paths with trusted, non-writable
ancestors until enforcement moves to the engine host or a Dorka-owned staging tree.

### Native requirements preserve transitional evidence

Commit `4c18dfe56` proves capability advertisement, Computer-local skill/MCP launch, immutable Run
revision snapshots, and fail-closed rejection under the old placement. Preserve that campaign as
regression evidence for snapshot and failure mechanics. It does not prove the corrected control-plane
provider/global-skill boundary and must not gate its acceptance.

### Agent and Run records no longer lose cross-instance writes

Commit `ee8fffcb1` keeps the `AgentRosterStore` public interface unchanged but rereads the latest durable
snapshot under the existing cross-process file transaction lock before every mutation. Separate store
instances can now create Agents and Runs concurrently without replacing each other's records. The
change remains behind the existing store boundary and does not alter PTY ownership or exit evidence.

### Recent Runs reuse incumbent terminal activation

Commit `1150a8d71` adds one pure lookup from immutable Run identity plus existing renderer terminal
state to a workspace/tab/leaf target. The UI then delegates to the established workspace and pane
activation functions. It does not create a second terminal transport, session registry, or lifecycle
owner. If no exact represented terminal exists, the action is absent and persisted output remains the
fallback.

### Final acceptance remains one gate, not a second harness

Commit `78a8c8335` composes locked installation and contract checks around the existing native harness.
It adds ownership-aware cleanup and one machine-readable verdict without duplicating container or Run
lifecycle logic. Commit `1a3755ba6` extends the existing hidden Electron scenario with exact mutation
assertions and capability-negative behavior rather than adding a second mock app.

## Ranked remaining findings

| Rank | Verdict | Finding                                                                                                                          | Required direction                                                                                                                                            |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Blocker | Provider processes, provider credentials, and global skills/MCP currently live in the Computer.                                  | Move them to the control plane. Keep Computer-owned workspace state behind one managed execution adapter and prove no ownership leakage.                      |
| 2    | Next    | Replacement recovery still exposes a temporal store callback protocol and has no durable in-progress intent for process crashes. | Deepen the existing configuration/reconciler seam into one recoverable operation; persist intent and let startup reconciliation complete or roll it back.     |
| 3    | Next    | Exact lexical premount authorization is centralized, but the Server container cannot canonicalize engine-host symlinks.          | Move enforcement to an engine-host authority or stage approved content in a Dorka-owned tree; do not present Server-container `realpath()` as authoritative.  |
| 4    | Next    | Cross-entity Agent/Run/Computer/Server rules are split between `DorkaRuntimeService` pass-throughs and dorkad composition.       | Deepen the existing dorkad control plane and let `DorkaRuntimeService` remain the capability boundary that delegates to it. Do not add a facade or transport. |
| 5    | Next    | The configuration renderer still combines remote state, editor state, validation, and most fields in one large component.        | Extract one reviewed-configuration state machine plus substantive environment and premount editors; avoid cosmetic wrappers.                                  |
| 6    | Later   | Capability requirements and response parsing are duplicated between RPC method arrays and renderer clients.                      | Add lifecycle-operation descriptors with params, result schema, and capability metadata while preserving method strings and envelopes.                        |
| 7    | Later   | Run and Computer UI behavior classifies some failures by matching prose.                                                         | Add an additive, allowlisted domain error vocabulary while retaining human messages and mixed-version fallback.                                               |

## Modules to preserve

### `ComputerRunSourceControl`

Keep this as the Server-owned authority that resolves:

```text
runId -> Run.computerId -> managed connection -> /workspace-confined Git operation
```

Clients must not provide Computer IDs, SSH targets, key paths, repository roots, tokens, or provider
accounts. Diff remains working-tree state. Review remains an explicit Git-ref comparison.

### `ComputerRuntimeManager`

Keep lifecycle serialization, durable records, reconciliation, and command invocation together. Keep
container argv as arrays. Do not split Docker and Podman builders while both implement the supported
Docker-compatible CLI contract.

### `DorkaRuntimeService`

Preserve it as the established runtime composition and capability boundary for desktop and `dorkad`.
Do not inline authorities into RPC handlers. As the dorkad control plane deepens, replace groups of
cross-entity pass-through policy with delegation to that one aggregate; keep optional-dependency checks
and capability honesty at this boundary.

## Validation evidence

The review's implemented changes passed the checks below under the transitional Computer-local provider
placement. This evidence remains valid for those mechanics, but it does not close the ownership blocker:

- 56 focused tests across execution, launcher, startup recovery, PTY observation, and runtime identity.
- 39 focused tests across managed connection projection, Run source control, Git identity, and launch scope.
- Owned Oxlint and Oxfmt checks.
- Node typecheck.
- Node-only `dorkad` build.

The detailed working audit was produced as `/tmp/dorka-deep-module-wave2.md`. This document preserves
the accepted findings and decisions in the repository without treating deferred recommendations as
completed work.
