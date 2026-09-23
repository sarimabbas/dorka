# Dorka deep-module review

## Scope and verdict

This review covers the Agent, Run, Computer, and Server vertical slice through `1a3755ba6`. It applies
Ousterhout's deep-module criteria: information hiding, interface leverage, temporal coupling, policy
ownership, error vocabulary, and deletion opportunity.

The core model is sound. `AgentExecutionService`, `ComputerRunSourceControl`,
`ComputerRuntimeManager`, and `ManagedRunPtyExitObserver` are deep product modules. They hide
meaningful policy behind small interfaces. Cross-instance Agent/Run roster writes now use the existing
whole-file transaction lock. Exact Run execution identity, relay parsing, strict evidence-candidate
projection, and certificate matching now live behind one internal module. Computer configuration now
has a revision-fenced, redacted `get/plan/replace` seam for resources, ordinary environment, and
operator-allowlisted premounts. The retained shell now presents that capability through a redacted
Review → Apply flow. Apply is bound to the exact reviewed request, lifecycle state participates in the
replacement fence, and ordinary replacement-command failures trigger reconciliation. The remaining
debt is crash-recoverable replacement intent, canonical host-path policy, and a smaller renderer state
machine.

```text
Renderer domain clients
  -> authenticated runtime RPC
  -> Server product authorities
       -> AgentRosterStore
       -> AgentExecutionService
       -> ComputerRuntimeManager
       -> ComputerRunSourceControl
       -> ComputerGitIdentityManager
  -> managed Computer host
  -> incumbent SSH / PTY / Git adapters
```

Do not create a second transport, store, Git adapter, or execution model to address the findings below.
Deepen the existing seams instead.

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

### Agent references are portable and fail closed

Commits `09c4e4384` through `e2ee00657` add a strict names-only reference set without storing paths,
commands, URLs, environment, credentials, or package data on the Agent. Lazy v1→v2 migration,
revision-fenced updates, and `createRunForAgent` atomically snapshot the latest durable revision.
Preparation failures remain queued→failed; only the terminal-launch phase may project an unverifiable
spawn to waiting.

The composed resolver uses the managed Computer's incumbent SSH filesystem provider, generation-fences
its evidence, reuses skill discovery, bounds MCP reads, and rejects unavailable or wrong-scope facts.
Remote transport failures propagate instead of becoming evidence of absence. `agents.references.update`
reuses the store CAS, while `agents.references.v1` is advertised only when both the roster and enforcing
execution service are present. The compact inline editor hides itself from old or unverifiable runtimes.

### Premount authorization has one honest policy boundary

Commit `ff6d9d962` centralizes exact lexical source authorization in
`ComputerMountSourcePolicy` and applies it during planning, replacement, and final engine creation.
This removes duplicated checks and prevents a reviewed request from bypassing the runtime guard.
The policy deliberately does not call Server-container `realpath()` authoritative: Docker resolves bind
sources in the engine-host namespace. Operators must attest canonical paths with trusted, non-writable
ancestors until enforcement moves to the engine host or a Dorka-owned staging tree.

### Native requirements reuse the production composition

Commit `4c18dfe56` extends the existing native two-Computer campaign instead of creating a parallel
runtime. It proves capability advertisement, a successful Computer-local skill/MCP launch, immutable
Run revision snapshots, and missing-skill/disabled-MCP rejection before terminal, process identity, or
Agent-shim launch. Commits `5d572a1a1` and `06e25b716` also removed the fixture's assumption that the
exit journal began empty; acknowledgement assertions now compare against the exact pre-case baseline.

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

| Rank | Verdict | Finding                                                                                                                          | Required direction                                                                                                                                               |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Next    | Replacement recovery still exposes a temporal store callback protocol and has no durable in-progress intent for process crashes. | Deepen the existing configuration/reconciler seam into one recoverable operation; persist intent and let startup reconciliation complete or roll it back.        |
| 2    | Next    | Exact lexical premount authorization is centralized, but the Server container cannot canonicalize engine-host symlinks.          | Move enforcement to an engine-host authority or stage approved content in a Dorka-owned tree; do not present Server-container `realpath()` as authoritative.     |
| 3    | Next    | Cross-entity Agent/Run/Computer/Server rules are split between `DorkaRuntimeService` pass-throughs and dorkad composition.       | Deepen the existing dorkad control plane and let `DorkaRuntimeService` remain the capability boundary that delegates to it. Do not add a facade or transport.    |
| 4    | Next    | Managed skill discovery still carries an optional host bag and launch resolution reconnects before terminal launch.              | Deepen the existing host projector into one Computer execution-host lease; keep Orca SSH/filesystem/PTY adapters internal and avoid a second provider framework. |
| 5    | Next    | The configuration renderer still combines remote state, editor state, validation, and most fields in one large component.        | Extract one reviewed-configuration state machine plus substantive environment and premount editors; avoid cosmetic wrappers.                                     |
| 6    | Later   | Capability requirements and response parsing are duplicated between RPC method arrays and renderer clients.                      | Add lifecycle-operation descriptors with params, result schema, and capability metadata while preserving method strings and envelopes.                           |
| 7    | Later   | Run and Computer UI behavior classifies some failures by matching prose.                                                         | Add an additive, allowlisted domain error vocabulary while retaining human messages and mixed-version fallback.                                                  |

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

The review's three implemented changes passed:

- 56 focused tests across execution, launcher, startup recovery, PTY observation, and runtime identity.
- 39 focused tests across managed connection projection, Run source control, Git identity, and launch scope.
- Owned Oxlint and Oxfmt checks.
- Node typecheck.
- Node-only `dorkad` build.

The detailed working audit was produced as `/tmp/dorka-deep-module-wave2.md`. This document preserves
the accepted findings and decisions in the repository without treating deferred recommendations as
completed work.
