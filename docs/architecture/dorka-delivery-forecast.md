# Dorka delivery forecast

## Purpose and status

This forecast turns the functioning-version goal into an ordered delivery plan. It reflects
`feat/dorka-computers` through `e3ddb0d54` and the evidence listed below. A checked item means the
repository contains both implementation and named verification evidence, or the functioning-version
goal records a completed live check. It does **not** mean the full graphical Computer MVP is proved.

Current verdict: the retained shell, managed execution path, durable Run history, Computer-local Git
identity, Run-scoped Diff, and provider-neutral Review form a functioning integration baseline.
Native-Linux graphical-image readiness and durable exit evidence for the interval when the Server is
offline remain open. Exact PTYs that survive restart now re-arm the incumbent exit observer after
reconnection without relaunch or state inference.

## Execution flow

```text
Desktop/mobile client
  -> authenticated dorkad RPC
  -> create/select Agent preset + Computer
  -> create Run with agentId + computerId
  -> launch the preset through the existing remote PTY/session path
  -> persist terminal session/process identity on the Run
  -> stream terminal, status, diff, review, and questions back to clients
  -> reconcile Run and Computer state after client or server restart
```

The launch path is production-composed through `AgentExecutionService`, a persistent server-owned
Computer control key, the Node-safe managed SSH relay/session owner, and the incumbent remote PTY
terminal flow. It preserves stable launch identity, treats committed-but-unconfirmed spawn as
waiting, and moves a running Run to waiting only after certified PTY death. Run-scoped Git operations
resolve placement server-side and execute inside the Computer. Rootless Podman proved this path with
a diagnostic headless entrypoint; the full Selkies image still needs native-Linux evidence.

## Prioritized backlog

| Priority | Horizon | Type | Deliverable and acceptance evidence | Dependencies | Forecast |
| --- | --- | --- | --- | --- | --- |
| P0 | Now | Validation | Run the standard Selkies Computer entrypoint on native Linux. Prove desktop readiness, managed SSH/relay launch, terminal streaming, and no published Computer ports. | Native amd64 Linux; rootless engine socket | 1–2 engineering days |
| P0 | Now | Bug/validation | Complete host-certified PTY exit replay across a Server outage. Computer/Run execution generations and the crash-durable journal are implemented; compose certified exit writers, capability-gated list/ack RPCs, projection-before-ack reconciliation, and native-Linux outage proof. Never retry or infer death from lost contact. | Incumbent relay PTY exit paths and dispatcher; managed Run recovery; native-Linux outage fixture | 2–4 days |
| P0 | Now | Validation | Prove first-run `Main` provisioning on native Linux with rootless Docker and Podman, including missing-image degradation, server replacement, and Computer reconciliation. | Built Computer image; engine socket; Linux runner | 2–4 days |
| P1 | Next | Validation | Prove two-Computer identity isolation: separate home/workspace volumes and Git identities, shared identity within one Computer, and changed identity after moving an Agent's next Run. | Native-Linux P0 evidence; two isolated repositories | 2–4 days |
| P1 | Next | Feature | Expose honest provisioning/retry state and compact Agent/Computer selection in the retained shell, without reintroducing a parallel shell. | Stable Run lifecycle; renderer state projection | 3–5 days |
| P1 | Next | Feature | Add versioned Agent skill/MCP references and resolve them at launch without moving credentials, provider homes, packages, or files into Agent state. | Stable capability catalog and Computer-local resolution contract | 3–5 days |
| P1 | Next | Validation | Exercise Mac, mobile, folder-workspace, SSH/remote, restart, and mixed-client-version flows against one headless Server. | Stable RPC contract; fixtures for each execution boundary | 1–2 weeks |
| P1 | Next | Bug/cleanup | Complete the terminology pass while retaining precise repository, branch, folder-workspace, and worktree terms where they describe real execution details. | Finalized product copy; reachability tests | 2–4 days |
| P2 | Later | Feature | Add authenticated Selkies desktop proxying with short-lived Computer-scoped tickets and persisted browser/desktop state. | Stable Computer network, session, and authorization model | 2–4 weeks |
| P2 | Later | Hardening | Add quotas, disk accounting, image allowlisting, egress policy, backups, credential rotation, audit events, and upgrade drain behavior. | Proven P0/P1 lifecycle; written threat model | 2–4 weeks |
| P2 | Later | Cleanup | Delete unreachable legacy modules and proprietary relay/cloud-account paths only after direct-connect, reconnect, mobile-resume, and mixed-version gates pass. | Reachability inventory and replacement coverage | Incremental; 2–4 weeks |

Forecasts are engineering ranges, not calendar commitments. They assume one engineer, available
Linux/container test infrastructure, and no migration redesign. The remaining P0 slice is realistically **4–8 engineering days**, dominated by native-Linux
validation and composing the durable journal into certified relay exit paths and projection-before-ack
reconciliation. The identity fence and standalone crash-durable journal are complete, but they do not
close mixed-version replay or outage E2E by themselves. P1 adds **1–2 weeks**. P2 should be planned
only after P0 evidence is green.

## Completion evidence

| Status | Completed capability | Evidence |
| --- | --- | --- |
| ✅ | Durable Agent presets and Run records | `src/main/agents/agent-roster-store.ts`; `agent-roster-store.test.ts`; commits `b2b7b2c58`, `00c44aff8` |
| ✅ | Persistent Computer lifecycle records, manager-owned mutation ordering, and reconciliation | `src/main/computers/computer-runtime-manager.ts`; concurrency/recovery tests; commits `aff13464f`, `e3372e3a4` |
| ✅ | Agent/Computer control-plane composition and authenticated RPC methods | `src/main/dorkad/dorkad-control-plane.ts`; its test; `src/main/runtime/rpc/methods/lifecycle-rpc.test.ts`; commits `eafda17fd`, `6b412e0d8`, `4d8dc2ba7` |
| ✅ | Idempotent first-run defaults with degraded startup when provisioning fails | `src/main/dorka-bootstrap/dorka-first-run.test.ts`; `src/main/dorkad/dorkad-first-run.test.ts`; commits `86605b63f`, `bad589c2e` |
| ✅ | Containerized `dorkad` build, external bind, sibling Computer topology, and rootless Podman socket handling | `Dockerfile`; `compose.yaml`; `docker/computer/Dockerfile`; `docs/reference/container-deployment.md`; commits `3b5b58a87`, `44c8b3c9b`, `4689aca73` |
| ✅ | Retained single application shell with unsupported navigation and quick-command/status-bar surfaces removed | Renderer reachability/settings/quick-command tests; commits `a7da41fbd`, `29a0bb985`, `6a6f107cf`, `e26684aff`, `20584d4ef`, `13d9b8136` |
| ✅ | Composed managed-Computer Agent execution with durable Run placement/session/process identity | `agent-execution-service.ts`; `managed-computer-agent-terminal-launcher.ts`; `dorkad-computer-agent-execution.ts`; adapter/service tests; commits `b31581377`, `9802a6006`, `1fc0db4df` |
| ✅ | Safe ordinary environment injection and exact operator-allowlisted premounts | Computer command/manager tests; deployment docs; commit `37b4a5fdf` |
| ✅ | Persistent Computer home matches the image's actual `/home/ubuntu` user | command construction and rejection tests; commit `98397f367` |
| ✅ | Per-Computer server-owned Ed25519 control key, persistent host-key volume, public-key-only injection, and password SSH disabled | key-store, command, manager, and image-entrypoint tests; commits `3df2d3e08` and the current architecture checkpoint |
| ✅ | `dorkad` omits unconfigured artifact/account/plugin RPC families and its SSH compatibility dispatcher has narrow authority | manifest/capability/SSH dispatcher tests plus `build:dorkad`; commits `294cbb766`, `f08b3f11c` |
| ✅ | Server image builds/packages the incumbent relay for managed Computer SSH sessions | `Dockerfile`; `dorkad-server-image-relay.test.mjs`; commit `1fc0db4df` |
| ✅ | Retained Settings exposes Agent presets, launch controls, durable Run history, Computer lifecycle, and Computer-local Git identity | focused renderer tests; commits `54d861ad2`, `edb8d33ad`, `05c23ac74`, `41c39e5ca`, `a91892f93` |
| ✅ | Run-scoped Computer source-control authority and provider-neutral Git-ref Review | strict RPC/source-control tests; live `/workspace` Git fixture; commits `d82881410`, `72d85e5d1`, `17ff80cc2` |
| ✅ | Best-effort startup host recovery without relaunch/start/mutation, certified PTY-exit projection to waiting, and exact observer re-arming for reattached persisted PTYs | recovery, runtime-identity, and PTY observer tests; commits `5b3f107c3`, `cb8e9c296`, `f27686310` |
| ✅ | Rootless Podman managed launch, restart, source-control, Review, and Git-identity evidence | `/tmp/dorka-managed-computer-e2e.md`; real server/Computer images with the documented headless-emulation limitation |
| ✅ | Paired-Server Settings QA for Agent launch, reload-persistent Run history, working-tree Diff, and Git-ref Review | `/tmp/dorka-paired-run-ui-qa.md`; hidden Electron/Playwright CDP with no renderer errors; commits `1e57fe508`, `5a46e5885` include two defects found during the pass |
| ✅ | Isolated retained-shell QA for project add, Settings, tabs, local terminal, local Diff, and Automations | `/tmp/dorka-computer-use-qa.md` and ten screenshots; hidden Playwright/Electron CDP against a throwaway `/tmp` repository |
| ✅ | Run source placement is resolved once, persisted on the Run, and passed unchanged to the managed terminal launcher | execution/launcher tests; commit `35aca87ad`; `dorka-deep-module-review.md` |
| ✅ | Managed Computer connection hides raw SSH targets, private key paths, and global Git-provider registration timing from execution and Git callers | 39 focused tests; commit `4a0d160b8`; `dorka-deep-module-review.md` |
| ✅ | Immutable Computer execution generations survive lifecycle/reconciliation, fence new Runs, and migrate legacy records without backfilling legacy Runs | manager/store/command/entrypoint/execution tests; commit `1a22d157b`; `dorka-offline-exit-evidence.md` |
| ✅ | Standalone relay exit journal provides strict exact certificates, no-clobber crash-durable writes, bounded reads, and idempotent projection-safe acknowledgement | relay journal tests; commit `e3ddb0d54`; not yet composed into PTY exits or RPC |
| ✅ | Integrated focused tests, typechecks, relay build, and Node-only `dorkad` bundle | 60 focused generation/journal tests; relay build for Linux/macOS/Windows targets; `build:dorkad` reports 4,594 modules and zero Electron/`node:sqlite` imports |
| ⬜ | Native-Linux graphical image proof and generation-fenced host-certified exit evidence across the Server-offline interval | Explicitly open in `dorka-functioning-version-goal.md` and designed in `dorka-offline-exit-evidence.md`; these remain P0 |

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
- **Scope creep:** desktop streaming, marketplace work, and broad legacy deletion can delay the P0
  launch path. Keep them out of Now.

## Milestone gates

1. **M0 — Baseline (complete):** retained shell launches; durable Agent/Computer control-plane
   seams exist; focused checks and a limited live smoke are recorded.
2. **M1 — Functioning local loop (Now):** managed launch, durable identity, Run Diff/Review, Git
   identity, non-relaunching restart, and paired-client UI are proved under rootless Podman.
   Native-Linux graphical startup and authoritative post-outage completion remain before the gate
   is complete.
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
