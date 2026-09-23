# Dorka delivery forecast

## Purpose and status

This forecast turns the functioning-version goal into an ordered delivery plan. It reflects
`feat/dorka-computers` through `876b1dd11` and the evidence listed below. A checked item means the
repository contains both implementation and named verification evidence, or the functioning-version
goal records a completed live check.

Current verdict: the retained shell now exposes first-class **Agents** and **Computers** entry points.
A paired desktop client has selected the native amd64 Server on `bfc5-et`, displayed the running
`Main` Computer, launched the default Agent into it, persisted Run history, and read the Run's real
terminal output through the existing runtime. The same native campaign proved authenticated Selkies
readiness, private Computer ports, outbound NAT, persistent SSH/desktop identity, missing-image
recovery, first-run provisioning, and Server replacement without duplicate launch. Host-certified PTY
exit replay while the Server is offline remains the only P0 acceptance item. The focused reproducer
proved that an interactive owning shell ignores `SIGTERM`; the fixture now uses `SIGKILL`, which closes
the PTY in the component probe. Exact Run execution identity is now centralized, and its strict candidate
projection removes the relay-generation field that the two-field evidence wire contract rejects. A final
clean native campaign must still prove certificate publication, projection-before-ack, and replay end to
end.

## Execution flow

```text
Desktop/mobile client
  -> authenticated dorkad RPC
  -> create/select Agent + Computer
  -> create Run with agentId + computerId
  -> launch the Agent through the existing remote PTY/session path
  -> persist terminal session/process identity on the Run
  -> stream terminal, status, diff, review, and questions back to clients
  -> reconcile Run and Computer state after client or server restart
```

The launch path is production-composed through `AgentExecutionService`, a persistent server-owned
Computer control key, the Node-safe managed SSH relay/session owner, and the incumbent remote PTY
terminal flow. It preserves stable launch identity, treats committed-but-unconfirmed spawn as
waiting, and moves a running Run to waiting only after certified PTY death. Run-scoped Git operations
resolve placement server-side and execute inside the Computer. Rootless Podman proved the earlier
headless path. The pinned GPU-optional Selkies image and the visible paired-client flow are now proved
on native amd64 Docker. Rocky 9's rootless Podman/cgroups-v1 combination remains unsuitable for this
gate, so acceptance supports an explicitly enabled, otherwise-empty isolated Docker engine.

## Prioritized backlog

| Priority | Horizon | Type        | Deliverable and acceptance evidence                                                                                                                                                                                                                                                                                                                                                                                   | Dependencies                                                           | Forecast               |
| -------- | ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| P0       | Done    | Validation  | Run the pinned GPU-optional Selkies Computer entrypoint on native amd64 Linux. Prove authenticated desktop readiness, managed SSH/relay launch, terminal output, outbound NAT, persistent identity, and no published Computer ports.                                                                                                                                                                                  | Isolated native Docker engine on `bfc5-et`                             | Completed 2026-09-23   |
| P0       | Now     | Validation  | Prove host-certified PTY exit replay across a Server outage on native Linux. The focused reproducer now closes the owning PTY, and replay now emits the strict two-field evidence candidate; rerun the clean campaign to verify journal creation, Server replacement, exact `running → waiting`, projection-before-ack, acknowledgement replay, and all negative unverifiable cases with disposable Computer volumes. | Fresh native acceptance host; production Computer entrypoint and relay | <1 engineering day     |
| P0       | Done    | Validation  | Prove first-run `Main` provisioning on native Linux, including missing-image degradation, server replacement, Computer reconciliation, and no duplicate managed launch.                                                                                                                                                                                                                                               | Built Computer image; isolated native Docker engine                    | Completed 2026-09-23   |
| P1       | Next    | Validation  | Prove two-Computer identity isolation: separate home/workspace volumes and Git identities, shared identity within one Computer, and changed identity after moving an Agent's next Run.                                                                                                                                                                                                                                | Native-Linux P0 evidence; two isolated repositories                    | 2–4 days               |
| P1       | Done    | Feature     | Expose honest Server connection/retry state and compact Agent/Computer selection in the retained shell, without reintroducing a parallel shell. Make Run terminal output and Diff/Review reachable from history.                                                                                                                                                                                                      | Stable Run lifecycle; renderer state projection                        | Completed 2026-09-23   |
| P1       | Now     | Feature     | Turn Agents and Computers from settings-first administration into compact operational surfaces. Hide raw runtime identities under Details; reuse incumbent tab activation for real Open terminal/chat/desktop actions; keep output preview as fallback.                                                                                                                                                               | Existing shell navigation and owned-session activation                 | 3–5 days               |
| P1       | Next    | Feature     | Expose existing safe Computer creation, ordinary environment, resource, and operator-allowlisted premount configuration through a redacted revisioned get/plan/replace module and confirmation UI. Keep secrets out of environment and engine arguments.                                                                                                                                                              | Computer record revisioning and replacement planning                   | 3–5 days               |
| P1       | Done    | Hardening   | Centralize exact managed Run execution identity and certified-exit projection behind one internal module, then deepen the existing dorkad control plane instead of adding another facade.                                                                                                                                                                                                                             | Exact identity and strict candidate tests                              | Completed 2026-09-23   |
| P1       | Next    | Feature     | Add versioned Agent skill/MCP references and resolve them at launch without moving credentials, provider homes, packages, or files into Agent state.                                                                                                                                                                                                                                                                  | Stable capability catalog and Computer-local resolution contract       | 3–5 days               |
| P1       | Next    | Validation  | Exercise Mac, mobile, folder-workspace, SSH/remote, restart, and mixed-client-version flows against one headless Server.                                                                                                                                                                                                                                                                                              | Stable RPC contract; fixtures for each execution boundary              | 1–2 weeks              |
| P1       | Next    | Bug/cleanup | Complete the terminology pass while retaining precise repository, branch, folder-workspace, and worktree terms where they describe real execution details.                                                                                                                                                                                                                                                            | Finalized product copy; reachability tests                             | 2–4 days               |
| P2       | Later   | Feature     | Add authenticated Selkies desktop proxying with short-lived Computer-scoped tickets and persisted browser/desktop state.                                                                                                                                                                                                                                                                                              | Stable Computer network, session, and authorization model              | 2–4 weeks              |
| P2       | Later   | Hardening   | Add quotas, disk accounting, image allowlisting, egress policy, backups, credential rotation, audit events, and upgrade drain behavior.                                                                                                                                                                                                                                                                               | Proven P0/P1 lifecycle; written threat model                           | 2–4 weeks              |
| P2       | Later   | Cleanup     | Delete unreachable legacy modules and proprietary relay/cloud-account paths only after direct-connect, reconnect, mobile-resume, and mixed-version gates pass.                                                                                                                                                                                                                                                        | Reachability inventory and replacement coverage                        | Incremental; 2–4 weeks |

Forecasts are engineering ranges, not calendar commitments. They assume one engineer, available
Linux/container test infrastructure, and no migration redesign. The remaining P0 slice is realistically
**1–2 engineering days**, now isolated to PTY termination and offline certificate acceptance.
Generation-fenced launch, durable relay evidence, exact Server replay, reconnect redrive, and
projection-before-ack are implemented and focused-tested. Use three validation levels: a fast
PTY/certificate reproducer, cached immutable-image native integration with fresh runtime state, and one
final clean release gate. Do not rebuild the full Selkies campaign for each relay fix. P1 adds **1–2
weeks**. P2 should be planned only after P0 evidence is green.

## Completion evidence

| Status | Completed capability                                                                                                                                                                                                    | Evidence                                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Durable Agent presets and Run records with cross-instance whole-file mutation serialization                                                                                                                             | `src/main/agents/agent-roster-store.ts`; concurrent-store and lifecycle tests; commits `b2b7b2c58`, `00c44aff8`, `ee8fffcb1`, `fd834fac8`                                                                                              |
| ✅     | Exact managed Run execution identity centralizes Run fencing, relay parsing, candidate projection, and certificate matching                                                                                             | `managed-run-execution-identity.ts`; observer, strict-candidate, durable-evidence, and native contract tests; commit `876b1dd11`                                                                                                       |
| ✅     | Persistent Computer lifecycle records, manager-owned mutation ordering, and reconciliation                                                                                                                              | `src/main/computers/computer-runtime-manager.ts`; concurrency/recovery tests; commits `aff13464f`, `e3372e3a4`                                                                                                                         |
| ✅     | Agent/Computer control-plane composition and authenticated RPC methods                                                                                                                                                  | `src/main/dorkad/dorkad-control-plane.ts`; its test; `src/main/runtime/rpc/methods/lifecycle-rpc.test.ts`; commits `eafda17fd`, `6b412e0d8`, `4d8dc2ba7`                                                                               |
| ✅     | Idempotent first-run defaults with degraded startup when provisioning fails                                                                                                                                             | `src/main/dorka-bootstrap/dorka-first-run.test.ts`; `src/main/dorkad/dorkad-first-run.test.ts`; commits `86605b63f`, `bad589c2e`                                                                                                       |
| ✅     | Containerized `dorkad` build, external bind, sibling Computer topology, and rootless Podman socket handling                                                                                                             | `Dockerfile`; `compose.yaml`; `docker/computer/Dockerfile`; `docs/reference/container-deployment.md`; commits `3b5b58a87`, `44c8b3c9b`, `4689aca73`                                                                                    |
| ✅     | Retained single application shell with unsupported navigation and quick-command/status-bar surfaces removed                                                                                                             | Renderer reachability/settings/quick-command tests; commits `a7da41fbd`, `29a0bb985`, `6a6f107cf`, `e26684aff`, `20584d4ef`, `13d9b8136`                                                                                               |
| ✅     | Composed managed-Computer Agent execution with durable Run placement/session/process identity                                                                                                                           | `agent-execution-service.ts`; `managed-computer-agent-terminal-launcher.ts`; `dorkad-computer-agent-execution.ts`; adapter/service tests; commits `b31581377`, `9802a6006`, `1fc0db4df`                                                |
| ✅     | Safe ordinary environment injection and exact operator-allowlisted premounts                                                                                                                                            | Computer command/manager tests; deployment docs; commit `37b4a5fdf`                                                                                                                                                                    |
| ✅     | Persistent Computer home matches the image's actual `/home/ubuntu` user                                                                                                                                                 | command construction and rejection tests; commit `98397f367`                                                                                                                                                                           |
| ✅     | Per-Computer server-owned Ed25519 control key, persistent host-key volume, public-key-only injection, and password SSH disabled                                                                                         | key-store, command, manager, and image-entrypoint tests; commits `3df2d3e08` and the current architecture checkpoint                                                                                                                   |
| ✅     | `dorkad` omits unconfigured artifact/account/plugin RPC families and its SSH compatibility dispatcher has narrow authority                                                                                              | manifest/capability/SSH dispatcher tests plus `build:dorkad`; commits `294cbb766`, `f08b3f11c`                                                                                                                                         |
| ✅     | Server image builds/packages the incumbent relay for managed Computer SSH sessions                                                                                                                                      | `Dockerfile`; `dorkad-server-image-relay.test.mjs`; commit `1fc0db4df`                                                                                                                                                                 |
| ✅     | Retained shell exposes first-class Agents and Computers navigation, actionable Server onboarding, Agent launch controls, durable Run history, real terminal output, Computer lifecycle, and Computer-local Git identity | focused renderer tests; paired native Server browser check; commits `57e5f9694`, `91e35c152` plus earlier Settings commits                                                                                                             |
| ✅     | Durable Agent presets appear before inherited client launch preferences without removing supported settings                                                                                                             | `AgentsPane` ordering contract; commit `5bfc2238d`                                                                                                                                                                                     |
| ✅     | Run cards lead with task, friendly Computer, and status; raw identities are disclosure-only and terminal tail is honestly labeled Output                                                                                | `AgentRunHistory` component contracts; commit `38f312094`                                                                                                                                                                              |
| ✅     | Product-facing Agent language replaces preset/harness terminology while preserving the stored model                                                                                                                     | Agent section and runtime-client contracts; commit `f733d0533`                                                                                                                                                                         |
| ✅     | Computer rows show a friendly name and lifecycle first; raw engine identity, image, and Git setup use progressive disclosure                                                                                            | Computer row component contracts; commit `aa82403d5`                                                                                                                                                                                   |
| ✅     | Run-scoped Computer source-control authority and provider-neutral Git-ref Review                                                                                                                                        | strict RPC/source-control tests; live `/workspace` Git fixture; commits `d82881410`, `72d85e5d1`, `17ff80cc2`                                                                                                                          |
| ✅     | Best-effort startup host recovery without relaunch/start/mutation, certified PTY-exit projection to waiting, and exact observer re-arming for reattached persisted PTYs                                                 | recovery, runtime-identity, and PTY observer tests; commits `5b3f107c3`, `cb8e9c296`, `f27686310`                                                                                                                                      |
| ✅     | Rootless Podman managed launch, restart, source-control, Review, and Git-identity evidence                                                                                                                              | `/tmp/dorka-managed-computer-e2e.md`; real server/Computer images with the documented headless-emulation limitation                                                                                                                    |
| ✅     | Paired-Server Settings QA for Agent launch, reload-persistent Run history, working-tree Diff, and Git-ref Review                                                                                                        | `/tmp/dorka-paired-run-ui-qa.md`; hidden Electron/Playwright CDP with no renderer errors; commits `1e57fe508`, `5a46e5885` include two defects found during the pass                                                                   |
| ✅     | Isolated retained-shell QA for project add, Settings, tabs, local terminal, local Diff, and Automations                                                                                                                 | `/tmp/dorka-computer-use-qa.md` and ten screenshots; hidden Playwright/Electron CDP against a throwaway `/tmp` repository                                                                                                              |
| ✅     | Run source placement is resolved once, persisted on the Run, and passed unchanged to the managed terminal launcher                                                                                                      | execution/launcher tests; commit `35aca87ad`; `dorka-deep-module-review.md`                                                                                                                                                            |
| ✅     | Managed Computer connection hides raw SSH targets, private key paths, and global Git-provider registration timing from execution and Git callers                                                                        | 39 focused tests; commit `4a0d160b8`; `dorka-deep-module-review.md`                                                                                                                                                                    |
| ✅     | Immutable Computer execution generations survive lifecycle/reconciliation, migrate legacy records without backfilling legacy Runs, and use cross-process crash-durable record transactions                              | manager/store/command/entrypoint/execution and multi-manager concurrency tests; commits `1a22d157b`, `44c7fd7b3`; `dorka-offline-exit-evidence.md`                                                                                     |
| ✅     | Relay exit journal has confined bounded reads, no-clobber crash durability, certified-only writers, generation-gated list/ack RPCs, and old-peer capability honesty                                                     | journal/PTY handler/runtime tests; commits `e3ddb0d54`, `95015efc1`                                                                                                                                                                    |
| ✅     | Managed launch is atomically generation-fenced at relay spawn; exact offline certificates project durably before ack and redrive after in-process reconnect                                                             | strict wire validation, launch/recovery/observer/store tests; commits `03d805448`, `28c1dc374`, `c62b401d8`                                                                                                                            |
| ✅     | Integrated focused tests, typechecks, relay build, and Node-only `dorkad` bundle                                                                                                                                        | final offline-evidence suite passes 113 focused tests; relay builds for Linux/macOS/Windows targets; `build:dorkad` reports 4,597 modules and zero Electron/`node:sqlite` imports                                                      |
| ✅     | Native-Linux graphical image, first-run reconciliation, authenticated desktop, private ports, outbound NAT, identity persistence, missing-image recovery, Server replacement, and managed launch                        | `bfc5-et` native amd64/Docker 28.3.3 acceptance run `dorka-native-20260923T134038Z`; result recorded here before its remote workspace, containers, volumes, networks, and images were removed; commits `3db0910ba` through `1cd5f7057` |
| ✅     | Visible paired-client `Server → Computer → Agent → Run → terminal/history` loop                                                                                                                                         | Hidden Electron/CDP check on 2026-09-23 using isolated pairing port `17668`, the `bfc5-et` native Server, `Main`, and a disposable Agent shim; commits `57e5f9694`, `91e35c152`                                                        |
| ✅     | Fast owning-PTY exit reproducer                                                                                                                                                                                         | `config/scripts/reproduce-native-pty-owner-exit.mjs` proves interactive `SIGTERM` is ignored and `SIGKILL` closes the PTY; fixture contract tests pass; commit `9cbc68f6a`                                                             |
| ⬜     | Server-offline exit replay and projection-before-ack native proof                                                                                                                                                       | Prior run stopped at `timed out waiting for pending certificate`. The diagnosed fixture fix now needs one final clean native release run.                                                                                              |

## Known risks

- **Execution-boundary drift:** launching on the Server instead of the selected Computer would break
  the credential and filesystem model. Keep all execution-owned state on the execution host.
- **False liveness:** a disconnected client or Server does not prove a Computer process exited.
  Preserve `live` / `unverifiable` / `exited` semantics through Run status.
- **Engine authority:** the mounted container-engine socket can control everything owned by its
  service account. Rootless operation reduces impact but is not a security boundary by itself.
- **Image availability:** the pinned Selkies base is currently `linux/amd64`; arm64 development may
  require emulation and can hide native-Linux defects.
- **SSH host identity:** the dedicated `/etc/ssh` volume preserves host keys across normal
  replacement. Recovery that loses this volume must still establish an explicit target generation;
  silently accepting a changed key is not allowed.
- **Wire compatibility:** clients and Servers update independently. Add optional RPC fields and
  capability-negotiate new stream behavior.
- **Review portability:** Computer-local review must support GitLab and other providers, not only
  GitHub credentials and terminology.
- **Exit-fixture ownership:** the fast reproducer proved interactive shells ignore `SIGTERM`; the
  fixture now uses `SIGKILL` and closes the PTY in isolation. Keep exact-generation and
  exact-incarnation checks unchanged, and require the clean native replay gate before closing P0.
- **Validation cost:** rebuilding and reprovisioning Selkies for every relay change hides the signal.
  Keep immutable images only when source/input labels match, always use fresh runtime state, and run
  the clean campaign once after focused checks pass.
- **Scope creep:** desktop streaming, marketplace work, and broad legacy deletion can delay the P0
  launch path. Keep them out of Now.

## Milestone gates

1. **M0 — Baseline (complete):** retained shell launches; durable Agent/Computer control-plane
   seams exist; focused checks and a limited live smoke are recorded.
2. **M1 — Functioning native loop (Now):** native graphical startup, managed launch, durable
   identity, terminal output, Run Diff/Review, Git identity, non-relaunching Server replacement, and
   paired-client UI are proved. Authoritative post-outage completion remains before the gate is
   complete.
3. **M2 — Isolated multi-Computer beta (Next):** placement, moves, identity isolation, remote/mobile
   reconnect, and mixed-version behavior pass end-to-end tests.
4. **M3 — Desktop and production hardening (Later):** scoped desktop access and operational controls
   satisfy security, recovery, and upgrade gates.

## Update protocol

Update this document in the same change that alters milestone scope or status:

1. Rebase the snapshot commit in **Purpose and status** to the reviewed code revision.
2. Mark an item complete only with a code path plus an automated test, or a named manual/E2E run
   with date, command, platform, and durable artifact.
3. Move incomplete work between Now/Next/Later instead of checking it optimistically.
4. Record new blockers in **Known risks** and add their dependency to the backlog row.
5. Revise forecast ranges when a dependency slips or measured work invalidates an assumption.
6. Never infer completion from implementation presence alone, and never treat loss of remote contact
   as proof that execution stopped.
