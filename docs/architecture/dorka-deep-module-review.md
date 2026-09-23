# Dorka deep-module review

## Scope and verdict

This review covers the Agent, Run, Computer, and Server vertical slice through `f27686310`. It applies
Ousterhout's deep-module criteria: information hiding, interface leverage, temporal coupling, policy
ownership, error vocabulary, and deletion opportunity.

The core model is sound. `AgentExecutionService`, `ComputerRunSourceControl`, and
`ComputerRuntimeManager` are deep product modules. They hide meaningful policy behind small
interfaces. The largest remaining design debt is below those product seams: the managed Computer host
interface leaks SSH adapter details and registry timing to its callers.

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

### Persisted Runs re-arm exact PTY observation

Commit `f27686310` reconnects each already-running Computer once, verifies the recovered terminal
handle against the exact persisted process identity, checks that the PTY belongs to the Run's Computer,
and re-arms the existing exit observer for every eligible Run. Colon-bearing relay PTY IDs are resolved
through runtime authority rather than delimiter guessing.

Missing handles, replaced incarnations, stopped Computers, reattach failure, and unverifiable contact do
not mutate or relaunch Runs. This closes observer reconstruction for PTYs that can be authoritatively
reattached. It does not manufacture evidence for an exit that happened while the Server was absent.

## Ranked remaining findings

| Rank | Verdict | Finding                                                                                                                                                                      | Required direction                                                                                                                                                       |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Next    | `ManagedComputerHostProjector.connect()` returns `SshTarget`, so source control, Git identity, and launch callers know SSH topology and global provider-registration timing. | Return a narrow connected-Computer view containing only execution-host identity and incumbent Git capability. Keep keys, targets, sessions, and provider lookup private. |
| 2    | Next    | Run launch persistence exposes a `create -> transition -> launch -> update identity` temporal protocol.                                                                      | Deepen the existing roster seam around committed, unverifiable, and failed launch outcomes. Coordinate this with PTY observation. Do not add a lifecycle store.          |
| 3    | Later   | Capability proof is repeated in renderer domain clients and React Computer settings.                                                                                         | Put required-capability proof in the existing runtime RPC client. Domain clients should expose Agent, Run, Computer, and source-control operations only.                 |
| 4    | Later   | Run and Computer UI behavior classifies some failures by matching prose.                                                                                                     | Add an additive, allowlisted domain error vocabulary while retaining human messages and mixed-version fallback.                                                          |
| 5    | Later   | `RunDiffDataSource` exposes form validation and React cache identity alongside remote Git operations.                                                                        | Replace it with a Run-bound four-operation client and one panel-local request controller with cancellation. Do not create a global store.                                |
| 6    | Later   | Computer Git identity writes name and email sequentially.                                                                                                                    | Make the existing relay mutation atomic while preserving unrelated Git config and permissions.                                                                           |
| 7    | Later   | Computer-create constraints are restated in RPC schemas and command validation.                                                                                              | Reuse one Computer-domain parser at RPC, persistence, and execution trust boundaries. Keep operator mount allowlisting and argv emission server-local.                   |

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

Its forwarding methods are intentionally shallow. They form the established composition and capability
boundary for desktop and `dorkad`. Inlining authorities into RPC handlers would spread optional-
dependency checks and weaken capability honesty.

## Validation evidence

The review's two implemented changes passed:

- 56 focused tests across execution, launcher, startup recovery, PTY observation, and runtime identity.
- Owned Oxlint and Oxfmt checks.
- Node typecheck.
- Node-only `dorkad` build.

The detailed working audit was produced as `/tmp/dorka-deep-module-wave2.md`. This document preserves
the accepted findings and decisions in the repository without treating deferred recommendations as
completed work.
