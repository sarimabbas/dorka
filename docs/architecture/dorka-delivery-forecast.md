# Dorka delivery forecast

## Purpose and status

This forecast turns the functioning-version goal into an ordered delivery plan. It reflects
`feat/dorka-computers` at `f08b3f11c` and the evidence listed below. A checked item means the
repository contains both the implementation and named verification evidence, or the functioning
version goal records a completed live check. It does **not** mean the full end-to-end MVP has been
proved.

Current verdict: the shell and control plane are a functioning integration baseline. Agent execution
inside a selected Computer is not yet a functioning end-to-end product flow.

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

The launch path is now production-composed through `AgentExecutionService`, a persistent
server-owned Computer control key, the Node-safe managed SSH relay/session owner, and the incumbent
remote PTY terminal flow. The implementation preserves a stable Run launch identity and treats a
committed-but-unconfirmed spawn as waiting rather than failed. Real-image launch/restart evidence,
authoritative reattachment, and Computer-local Diff/Review remain the critical gaps.

## Prioritized backlog

| Priority | Horizon | Type | Deliverable and acceptance evidence | Dependencies | Forecast |
| --- | --- | --- | --- | --- | --- |
| P0 | Now | Validation | Exercise the composed Computer SSH launcher against the curated image. Prove one Agent starts on `Main`, streams through the retained terminal, and records the returned handle and PTY incarnation. | Built Computer image; relay package; rootless engine socket | 1–2 engineering days |
| P0 | Now | Validation | Prove restart/reconnect restores the persisted `computerId`, terminal-session identity, and process identity without inferring process death from lost contact. | Concrete launcher adapter; execution-host status contract | 1–2 days, overlaps launch work |
| P0 | Now | Validation | Extend the completed isolated Electron fixture with safe provider-backed Review and the Computer launch path. Preserve the recorded tabs, Settings, local terminal, local Diff, and Automations evidence. | P0 launch path; credential-bearing disposable review fixture | 1–2 days |
| P0 | Now | Bug/validation | Prove first-run `Main` provisioning on native Linux with rootless Docker and Podman, including missing-image degradation, server restart, and Computer reconciliation. | Built Computer image; engine socket; Linux runner | 2–4 days |
| P0 | Now | Feature | Route local Diff and PR Review through the selected Computer's Git binary, credentials, and filesystem. Keep provider-specific behavior behind explicit GitHub/GitLab checks. | Run placement; remote Git execution; credential-bearing test repositories | 4–7 days |
| P1 | Next | Validation | Prove two-Computer identity isolation: separate home/workspace volumes and Git identities, shared identity within one Computer, and changed identity after moving an Agent's next Run. | All P0 runtime work; two isolated test repositories | 3–5 days |
| P1 | Next | Feature | Expose honest provisioning/retry state and compact Agent/Computer selection in the retained shell, without reintroducing a parallel shell. | Stable Run lifecycle; renderer state projection | 4–7 days |
| P1 | Next | Validation | Exercise Mac, mobile, folder-workspace, SSH/remote, restart, and mixed-client-version flows against one headless Server. | Stable RPC contract; fixtures for each execution boundary | 1–2 weeks |
| P1 | Next | Bug/cleanup | Complete the terminology pass while retaining precise repository, branch, folder-workspace, and worktree terms where they describe real execution details. | Finalized product copy; reachability tests | 2–4 days |
| P2 | Later | Feature | Add authenticated Selkies desktop proxying with short-lived Computer-scoped tickets and persisted browser/desktop state. | Stable Computer network, session, and authorization model | 2–4 weeks |
| P2 | Later | Hardening | Add quotas, disk accounting, image allowlisting, egress policy, backups, credential rotation, audit events, and upgrade drain behavior. | Proven P0/P1 lifecycle; written threat model | 2–4 weeks |
| P2 | Later | Cleanup | Delete unreachable legacy modules and proprietary relay/cloud-account paths only after direct-connect, reconnect, mobile-resume, and mixed-version gates pass. | Reachability inventory and replacement coverage | Incremental; 2–4 weeks |

Forecasts are engineering ranges, not calendar commitments. They assume one engineer, available
Linux/container test infrastructure, and no migration redesign. The remaining P0 slice is realistically
**1–2 weeks** including runtime validation, restart work, and source-control routing. P1 adds **2–3 weeks**. P2 should be planned
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
| ✅ | Retained Settings exposes durable Agent presets and Computer start/stop state | focused renderer tests; commits `54d861ad2`, `edb8d33ad` |
| ✅ | Isolated retained-shell QA for project add, Settings, tabs, local terminal, local Diff, and Automations | `/tmp/dorka-computer-use-qa.md` and ten screenshots; hidden Playwright/Electron CDP against a throwaway `/tmp` repository |
| ✅ | Focused tests, Node/renderer typechecks, and `dorkad` build are recorded complete | integrated 27-test control-plane/RPC run, 28-test Computer-key run, full typecheck, and 8.18 MB/4,408-module `build:dorkad` through `3df2d3e08` |
| ⬜ | Real-image Agent launch proof, restart/reconnect reconciliation, and Computer-local Diff/Review | Explicitly open in `dorka-functioning-version-goal.md`; these remain P0 |

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
2. **M1 — Functioning local loop (Now):** one Agent launches on `Main`; its Run persists Computer
   and terminal identity; terminal, tabs, Settings, Diff, Review, and Automations pass the fixture
   smoke; restart behavior is proven.
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
