# Dorka deep-module review

## Scope and verdict

This review covers the Agent, Run, Computer, and Server vertical slice through `09bd41365`. It applies
Ousterhout's deep-module criteria: information hiding, interface leverage, temporal coupling, policy
ownership, error vocabulary, and deletion opportunity.

The core model is sound. `AgentExecutionService`, `ComputerRunSourceControl`,
`ComputerRuntimeManager`, and `ManagedRunPtyExitObserver` are deep product modules. They hide
meaningful policy behind small interfaces. Cross-instance Agent/Run roster writes now use the existing
whole-file transaction lock. Exact Run execution identity, relay parsing, strict evidence-candidate
projection, and certificate matching now live behind one internal module. Computer configuration now
has a revision-fenced, redacted `get/plan/replace` seam for resources, ordinary environment, and
operator-allowlisted premounts. The largest remaining design debt is presenting that capability through
a simple confirmation UI without exposing environment values.

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

### Agent and Run records no longer lose cross-instance writes

Commit `ee8fffcb1` keeps the `AgentRosterStore` public interface unchanged but rereads the latest durable
snapshot under the existing cross-process file transaction lock before every mutation. Separate store
instances can now create Agents and Runs concurrently without replacing each other's records. The
change remains behind the existing store boundary and does not alter PTY ownership or exit evidence.

## Ranked remaining findings

| Rank | Verdict | Finding                                                                                                                    | Required direction                                                                                                                                            |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Next    | Computer configuration has a safe backend seam but no compact confirmation UI.                                             | Build UI on the redacted snapshot/plan. Preserve existing environment names by default; never represent hidden values with fake placeholders.                 |
| 2    | Next    | Cross-entity Agent/Run/Computer/Server rules are split between `DorkaRuntimeService` pass-throughs and dorkad composition. | Deepen the existing dorkad control plane and let `DorkaRuntimeService` remain the capability boundary that delegates to it. Do not add a facade or transport. |
| 3    | Later   | Capability requirements and response parsing are duplicated between RPC method arrays and renderer clients.                | Add lifecycle-operation descriptors with params, result schema, and capability metadata while preserving method strings and envelopes.                        |
| 4    | Later   | Renderer lifecycle clients still expose target selection, compatibility policy, and unchecked generic responses to React.  | Bind one lifecycle client to a runtime target and centralize capability/error/result handling. Keep UI state local.                                           |
| 5    | Later   | Run and Computer UI behavior classifies some failures by matching prose.                                                   | Add an additive, allowlisted domain error vocabulary while retaining human messages and mixed-version fallback.                                               |
| 6    | Later   | Computer-create constraints are restated in RPC schemas and command validation.                                            | Reuse one Computer-domain parser at RPC, persistence, and execution trust boundaries. Keep operator mount allowlisting and argv emission server-local.        |

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
