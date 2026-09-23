# Dorka: terminal-first, headless Computer plan

## Decision

Build Dorka as a **single-user, terminal-first agent roster** backed by multiple durable, isolated **Computers**. Dorka remains a terminal wrapper, not a new chat runtime.

The remote Linux server owns the control plane. macOS and mobile are thin clients. Agent provider processes run on the control plane with provider credentials and global skills/MCP. Each Run selects a Computer whose workspace, packages, Git/SSH identity, environment, secrets, and desktop are available only through a managed execution adapter. Agents remain durable launch presets independent of Computer placement.

```text
MacBook client ─┐
                ├── direct encrypted connection ──> Dorka Server
Mobile client ──┘                                  ├── Agent/provider processes
                                                   ├── provider credentials + global skills/MCP
                                                   └── managed execution adapter
                                                         ├── Computer A: workspace/packages/identity/env/secrets/desktop
                                                         └── Computer B: workspace/packages/identity/env/secrets/desktop
```

Deploy the Dorka Server itself as a container. Give it access to a **Docker-compatible engine socket** so it creates and manages sibling Computer containers. Prefer a rootless Docker or Podman engine on Linux. Do not use Docker-in-Docker, Firecracker, Kubernetes, or a provider-neutral runtime framework for the MVP.

## Why this model

Grok Bot gets its simplicity from a small product vocabulary. Its current hosted architecture uses a dedicated Firecracker microVM per user, while all Bots for that user share the computer. Its own documentation warns that files, browser sessions, and command-line credentials are therefore shared across the Bot roster.

Dorka should preserve the simple roster while keeping ownership explicit:

```text
Dorka: control-plane Agents ── managed execution ──> selected Computers
```

Put provider credentials, provider processes, and global skills/MCP on the Server. Put Git config, SSH keys, `gh` auth, workspace packages, environment, secrets, browser profiles, repositories, installed apps, startup programs, and the visual desktop inside each Computer. Keep Agent presets and Run records on the Server. Existing control-plane PTYs remain authoritative for provider transcripts. Never model Git identity as a per-terminal toggle or copy Computer secrets into the control plane.

## Product objects

Keep four first-class objects.

### 1. Server

The always-on Dorka control plane. It owns pairing, persistence, runtime lifecycle, scheduling, routing, Agent/provider processes, provider credentials, and global skills/MCP. There is normally one Server.

### 2. Computer

The product name for a durable isolated execution environment. The implementation record may be called `ComputerRuntime`.

A Computer owns:

- one container root filesystem;
- one persistent home volume;
- one persistent workspace volume;
- workspace-local packages;
- Git and SSH identity;
- workspace environment and secrets;
- installed applications and startup programs;
- one persistent graphical Linux desktop;
- resource limits and network policy.

A Computer is the **workspace execution boundary**. It does not host the provider process, provider credentials, or global skills/MCP. Multiple Agents assigned to one Computer can reach the same workspace-owned state through the managed execution adapter. The UI must say this plainly.

### 3. Agent

A durable launch preset around an existing CLI harness. It stores identity, character, name, job, `harnessId`, an optional model, a prompt template, an optional working directory, and an optional `lastComputerId`. The selected harness launches on the control plane and uses control-plane provider credentials and global skills/MCP.

An Agent does not own a Computer and has no permanent `computerId`. A Run records the assigned `computerId`. `lastComputerId` is only a launch convenience. Moving an Agent changes the Computer reached by its managed execution adapter; it does not copy workspace state, Git/SSH identity, environment, secrets, packages, or desktop sessions.

### 4. Run

One active or completed launch. A Run records status, timestamps, `agentId`, `computerId`, prompt, and optional control-plane terminal-session and provider-process identity. The `computerId` selects the managed workspace execution target; it does not place the provider process in that Computer. Placement belongs to the Run. It is not a sidebar object.

Conversation is not a durable domain object. The existing PTY or restored terminal session owns the transcript. Structured chat is an optional projection of that session, and raw Terminal is always available. Projects, repositories, branches, worktrees, panes, and PTYs remain execution details below this interface.

## Lessons from the Grok Bot reference screens

The reference screens sharpen the intended product behavior:

- The first-run experience is nearly empty and explains one idea at a time.
- A default teammate and its compute are prepared automatically; infrastructure setup is not the opening task.
- “Give each Bot a job” is the central mental model. Identity is conveyed through a simple colored character, name, and short role.
- The normal application can project a two-pane messenger from terminal sessions: roster on the left, structured session output on the right.
- Search and create share one command surface. Settings appear as a temporary right inspector, not a permanent third column.
- Setup questions, suggested jobs, capability requests, approvals, and working status may appear inline when the harness exposes structure.
- Dense configuration and integrations open only on demand in a drawer or modal.

Dorka should adopt those interaction principles without copying Grok's cloud sign-in, marketplace, voice-first controls, or claim that every Agent permanently owns one Computer.

## Primary user flow

The default flow must hide infrastructure until the user asks for it:

```text
Connect to Dorka Server with URL + pairing code
    ↓
Server prepares “Main” Computer and first Agent automatically
    ↓
Launch surface asks: “What should this Agent take off your plate?”
    ↓
User picks a suggested job or types one
    ↓
Harness requests only the missing capability or login
    ↓
Open Computer desktop only when interactive sign-in is required
    ↓
Run starts in an existing PTY on Main; terminal output stays authoritative
```

Advanced flow:

```text
+ → New Computer → choose image/resources/startup programs
+ → New Agent → name/job/character → Run on: Main ▾
Agent header Computer chip → move next Run to another Computer
```

The main UI should contain:

1. **Agent roster** in a narrow left sidebar with search and create.
2. **Terminal session** as the authoritative Run surface, optionally projected as structured chat.
3. **Agent header chip** showing state and current/next Computer.
4. **Inline cards** when a harness exposes structured questions, approvals, files, diffs, results, or progress.
5. **Transient right inspector** for Agent preset, Computer details, and Run details.
6. **Focused views** for raw Terminal, Desktop, Files, Diff, and Computers. Raw Terminal is always available.

Do not expose project groups, worktree lineage, terminal split topology, host scopes, SSH targets, pairing records, image digests, or container IDs in the default flow.

### Visual direction: minimal terminal companion with character

Dorka should feel like a roster of capable coworkers, not an IDE or infrastructure dashboard.

- Use a **near-black and charcoal** foundation with off-white text. Let Agent colors, state, and a restrained Dorka accent provide the only saturation.
- Give every Agent a simple generated character mark with two or three expressive traits, a color, a name, and a one-line job. Avoid generic profile photos and corporate illustrations.
- Keep the shell quiet: hairline dividers, large empty regions, soft rounded message surfaces, and almost no ornamental chrome.
- Keep projected transcript width readable. Do not stretch text across the entire window.
- Use a narrow roster by default. Expand it to show Agent names and last activity; collapse it to character marks on smaller windows.
- Put search and create at the top of the roster. The create surface offers only **New Agent** and **New Computer** in the MVP.
- Open Agent settings as a right inspector. Lead with character, name, job, harness, prompt template, and notifications. Keep the optional model and working directory under **Advanced**.
- Show the Computer as a compact chip in the Agent header. Clicking it opens status, Git identity, active Agents, resource pressure, Desktop, and “Move next Run.”
- Show Computer thumbnails only in the dedicated Computers view or connection picker. Do not spend permanent chat space on live thumbnails.
- Render tool and capability requests as clear inline cards with one primary action. For Computer credentials, the action is **Open desktop to sign in**.
- Show background work as a calm inline presence row. Expand it into technical logs only on demand.
- Use motion only for provisioning, connection, Run start/finish, questions, and Agent movement.
- On mobile, make chat primary. Put Agent and Computer switching in bottom sheets. Open the desktop as a focused full-screen surface with touch controls.

```text
Default desktop client
┌──────────────────────┬────────────────────────────────────────────────┐
│ Search           +   │       Agent mark · Ada     On Main ▾           │
│                      ├────────────────────────────────────────────────┤
│ ● Ada                 │                                                │
│   reviewing the PR    │  structured session projection                 │
│                      │  inline questions / approvals / evidence        │
│ ● Scout               │                                                │
│   waiting             │                                                │
│                      ├────────────────────────────────────────────────┤
│ Computers             │  +  Message Ada                                │
└──────────────────────┴────────────────────────────────────────────────┘

Agent inspector, only when opened
                                              ┌─────────────────────────┐
                                              │ character               │
                                              │ name / job              │
                                              │ preferred Computer      │
                                              │ notifications           │
                                              │ Advanced ▸              │
                                              └─────────────────────────┘
```

### Capabilities without an MVP marketplace

The screenshots make inline capability discovery valuable, but a public marketplace is unnecessary for the first product.

- Represent built-in Git, shell, files, browser, and MCP/tool connections as **Capabilities**.
- Let an Agent request a missing Capability inline at the moment it is needed.
- Keep provider OAuth, provider credentials, and global skills/MCP on the control plane.
- Route Git/SSH identity, workspace secrets, and interactive workspace login through the selected Computer.
- Provide one settings list of installed Capabilities and accounts. Do not build ratings, sharing, publishing, recommendations, or third-party Bot templates in the MVP.
- Treat workspace packages, startup programs, and desktop applications as Computer configuration, not Agent plugins.

## Direct client connectivity; no proprietary relay

Remove the Dorka-operated relay from the deployable product. The Server exposes one authenticated client endpoint. Users make that endpoint reachable through one of two explicit paths:

1. **Private network (default):** Tailscale, WireGuard, or LAN. Dorka keeps its existing end-to-end device pairing and application encryption.
2. **User-owned HTTPS ingress:** Caddy, nginx, or a tunnel owned by the user. Dorka still authenticates paired devices; the proxy terminates TLS and supports long-lived WebSocket upgrades.

```text
Mac / mobile client
        │
        ├── Tailscale/WireGuard/LAN ───────────────┐
        └── user-owned HTTPS + WebSocket ingress ──┤
                                                   ▼
                                        dorka-server:paired-port
```

The setup wizard should display the Server URL and one-time pairing code. It should not require a Dorka cloud account. Removing `cloud/` happens only after direct pairing, reconnect, push/poll fallback, and mobile background-resume tests pass without it.

## Reuse from Orca

The fork already contains most of the hard distributed-systems plumbing.

### Keep and deepen

- **Node-only headless server:** `src/main/orcad/` and `docs/reference/orcad-operations.md` already define a plain-Node control plane plus a detached terminal daemon.
- **Execution core:** existing launchers create CLI harness processes and durable PTYs own their streams. Keep those provider processes on the control plane and extend the path rather than building a separate chat executor.
- **Paired clients and versioned RPC:** use the existing runtime pairing and mixed-version compatibility contracts.
- **Mobile transport and projections:** keep session status, transcript, questions, and basic source review.
- **Agent launch/status:** retain supported CLI launchers, hooks, and status. Structured chat remains an optional presentation of terminal activity.
- **Managed execution seam:** reuse the existing SSH file/Git/PTY adapters behind one adapter through which control-plane Agents operate on the selected Computer.
- **Environment lifecycle ideas:** generalize the useful lifecycle pieces under `ephemeral-vm-*`; do not keep the current project/workspace-coupled product model.

### Rename concepts

The current word “runtime environment” means a paired Orca host. That conflicts with the new product object.

Use:

- **Server** for the deployed Dorka control plane.
- **Computer** in the product for an isolated desktop container/VM managed by that Server.
- **ComputerRuntime** internally for its lifecycle/state record.
- **Execution adapter** for the internal mechanism used to run inside a Computer.

### Replace rather than layer

Do not add a new runtime system beside `ephemeral-vm`, SSH, paired runtimes, and workspaces indefinitely. Build the Computer vertical slice, migrate the retained behavior, then delete the superseded paths.

## Computer implementation

### MVP: containerized control plane + sibling Computer containers

The Dorka Server is a replaceable control-plane container. It mounts a persistent data volume and the host's Docker-compatible Unix socket. It creates long-lived sibling Computer containers. It does **not** run an inner Docker daemon.

```text
Linux Docker host
   │
   ├── Docker-compatible engine (prefer rootless)
   │      ▲
   │      │ Unix socket, mounted only here
   │
   ├── dorka-server container
   │      ├── dorkad control plane
   │      ├── /data named volume
   │      ├── ComputerRuntimeManager ── docker CLI
   │      └── existing SSH execution adapter
   │
   ├── dorka-computer-a container
   │      ├── home-a volume
   │      ├── workspace-a volume
   │      └── internal sshd + agent runner
   │
   └── dorka-computer-b container
          ├── home-b volume
          ├── workspace-b volume
          └── internal sshd + agent runner
```

All three containers join a private bridge network. Computer containers are discoverable by deterministic container name. Their SSH ports are not published on the host. Only the Dorka Server joins the client-facing network or publishes the paired-client port.

Why this path:

- It makes the entire Server deployable and upgradable with Docker Compose.
- Replacing the Server container leaves sibling Computer containers and their in-container agent processes alive.
- It reuses Orca's mature remote PTY, Git, file, and reconnect behavior.
- It keeps one central Server authoritative, so mobile and MacBook attach to one place.
- It avoids mounting the host repository or host home into any Computer.
- It avoids running a second full Dorka control plane in every Computer.
- It proves the product model before replacing internal SSH with a tighter engine-exec transport.

Use the Docker CLI through the repository's existing child-process wrapper. Keep one narrow module responsible for constructing every engine command and validating names, images, labels, volumes, limits, and networks. Do not accept arbitrary Docker flags or mount specifications from Agent prompts.

The engine socket is a deliberate high-authority seam. Docker's security documentation explains that daemon access can mount the host root filesystem and alter it. Therefore:

- Prefer a rootless Docker or rootless Podman service account.
- Mount the Unix socket only into the Dorka Server container.
- Never mount it into a Computer container.
- Never expose it over unauthenticated TCP.
- Treat compromise of the Dorka Server as compromise of everything the engine user can access.
- Validate container-create inputs against Dorka-owned templates; do not proxy arbitrary Engine API requests.

Each Computer container should receive:

- a random Computer ID plus labels such as `dev.dorka.managed=true` and `dev.dorka.server=<instance>`;
- a generated SSH host key;
- a Dorka-generated per-runtime client key;
- separate `home` and `workspace` named volumes;
- CPU, memory, PID, and disk limits;
- no privileged mode;
- no host network;
- no engine socket;
- no host SSH agent forwarding;
- no host filesystem bind mounts by default;
- a private-network alias derived from the Computer ID.

Store the private client key, desired Computer records, provider credentials, and global skills/MCP in the Server's `/data` volume. Store Git/SSH identity, workspace environment and secrets, packages, and desktop state only inside each Computer's volumes. On startup, reconcile desired records with engine containers by immutable labels. Never infer ownership from a human-readable container name alone.

### Visual desktop: Selkies inside each Computer

Use **Selkies in WebSocket mode** for the MVP. It already packages a browser-accessible Linux desktop, input, clipboard, audio, CPU rendering, and optional GPU acceleration. It provides a more polished interactive desktop than building a raw noVNC stack, while avoiding Kasm Workspaces as a second orchestration/control plane. Keep WebRTC as an optional later optimization because it adds TURN and firewall complexity.

```text
Dorka client Desktop tab
        │ short-lived desktop ticket
        ▼
dorka-server authenticated reverse proxy
        │ private WebSocket route
        ▼
Computer container :8080
  └── Selkies → persistent desktop session → apps/browser/files
```

Rules:

- Do not publish a Computer's desktop port on the host.
- Reverse-proxy a scoped path such as `/computers/:id/desktop/*` through the Server to the private container network.
- Mint a short-lived, single-Computer ticket for each viewer. Never expose Selkies' basic-auth secret to the client.
- Allow one controlling viewer in the MVP. Additional viewers are read-only to avoid conflicting input.
- Persist desktop and browser profiles in the Computer home volume. Reconnecting must attach to the existing desktop, not start a clean one.
- Render the desktop inside the Electron client and mobile webview. Provide fit, 1:1, keyboard, clipboard, and touch-trackpad modes.
- Treat the current CDP page-screencast implementation as disposable. It streams one Chromium page, not a complete desktop. Reuse only its subscription, backpressure, reconnect, and binary-frame test patterns where useful.
- Start with CPU rendering and a lightweight desktop. Add `/dev/dri` or NVIDIA templates only as explicit administrator options.

If Selkies fails the first vertical slice on mobile Safari/WebView, use noVNC as the fallback because its RFB client is simple and embeddable. Do not adopt the full Kasm Workspaces platform.

### Computer image and startup model

Ship one curated `dorka-computer` image first. It contains a lightweight desktop, browser, terminal, Git, SSH server, the managed execution endpoint, and Selkies. It does not contain provider launchers or global skills/MCP. A Computer definition stores:

- immutable base image digest;
- CPU, memory, and disk limits;
- environment-variable names backed by Server-held secrets;
- ordered startup programs with command, working directory, restart policy, and enabled state;
- volume IDs and desktop settings.

Run startup programs under the unprivileged Computer user after volumes mount and before a Computer becomes `ready`. Record health and logs. Do not permit host mounts, privileged mode, engine-socket access, or arbitrary container-create flags.

### Upgrade path

1. Replace internal SSH with a native Docker exec/file adapter only if measurements show SSH relay complexity is a material problem.
2. Add a restricted engine-socket proxy only if its create-payload policy can actually prevent arbitrary host mounts; endpoint allowlisting alone is insufficient.
3. Add Firecracker as a stronger isolation tier only when untrusted multi-user workloads require a separate guest kernel.
4. Add remote/cloud Computer providers only after the single-host sibling-container lifecycle is stable.

Firecracker is credible later: its official site documents KVM-based microVMs, sub-125 ms startup, and under 5 MiB overhead. It is still the wrong MVP because image building, networking, storage, kernel management, and guest agents would become Dorka's problem immediately.

## Container versus VM decision

| Option                                      | Startup/cost                                                      | Isolation                                                               | Fit now                                                                                 | Decision          |
| ------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------- |
| Rootless Docker or Podman sibling container | Fast and cheap; shares Linux kernel                               | Good process/filesystem boundary, not hostile multi-tenant VM isolation | Excellent; Server itself is also a container                                            | **MVP**           |
| Docker-in-Docker                            | Extra daemon, storage, networking, and privileged-mode complexity | Misleading unless heavily privileged                                    | Solves no requirement here; sibling containers survive control-plane replacement better | Reject            |
| Firecracker microVM                         | Fast for a VM; own kernel                                         | Stronger hardware-backed boundary                                       | Requires substantial host and image machinery                                           | Later tier        |
| Full cloud VM per Agent                     | Slowest and costs money while running                             | Strong                                                                  | Useful only for BYO-cloud expansion                                                     | Later provider    |
| macOS per-container VM                      | Useful for local demos                                            | VM-backed on macOS                                                      | Not relevant to the primary Linux deployment                                            | Dev fallback only |

On macOS, Podman itself runs Linux containers inside one managed Linux VM. That is sufficient for development. Production behavior must be validated on native Linux.

## Ruthless feature cuts

### Keep for the first usable Dorka

- containerized headless Server;
- Mac desktop client and mobile client;
- direct device pairing and reconnect over Tailscale/WireGuard/LAN or user-provided TLS ingress;
- Agent launch presets, terminal transcripts, optional structured projections, status, questions, stop/retry;
- Computer create/start/stop/delete, startup programs, and Agent placement/moves;
- interactive visual desktop streaming;
- raw Terminal as an always-available primary surface;
- Git clone/status/diff/commit/push and basic file/result review;
- Codex, Claude, and Pi launchers initially.

### Remove from the product surface, then delete code after reachability tests

- project groups and folder-workspace organization;
- worktree-first sidebar, lineage, kanban, and dashboard variants;
- direct user-managed SSH hosts;
- per-workspace Cloud VM recipes as a user-facing model;
- WSL-specific execution;
- Jira, Linear, GitHub-project, GitLab, Bitbucket, Gitea, and Azure DevOps task browsers;
- Orca's embedded browser/design-mode/computer-use stack after the Computer desktop replaces it;
- emulator, speech, and dictation;
- automations/routines until the core Run lifecycle is trustworthy;
- AI Vault and broad session search;
- account hot-swap and usage dashboards on the Server host;
- plugins/marketplace and skill sharing;
- mobile file editing and browser mirroring;
- source-control provider conveniences beyond generic Git;
- the proprietary cloud relay (`cloud/`) and relay-only account/pairing flows; use direct private networking or user-owned TLS ingress;
- Windows as a Server host. Keep Windows only as a client target if it still works cheaply.

Do not delete transport security, persistence migration, process-liveness verdicts, cleanup fencing, or mixed-client wire compatibility. Those are not optional features.

## Implementation phases

### Phase 0 — Freeze the baseline

- Complete the Dorka product rename without changing wire compatibility blindly.
- Record current local build and headless smoke commands.
- Record the four product objects in this plan.
- Mark features as `keep`, `migrate`, or `delete`; stop adding features to delete-marked modules.

Acceptance:

- CLI, Node typecheck, and headless terminal smoke pass.
- Existing Mac client can pair to the headless Server.
- Existing mobile client can pair to the same Server.

### Phase 1 — One managed Computer vertical slice

Create a concrete `ComputerRuntimeManager` module with a small interface:

```text
create(name, image) -> ComputerRuntime
start(computerId) -> ComputerRuntime
stop(computerId) -> ComputerRuntime
remove(computerId) -> void
inspect(computerId) -> ComputerRuntimeStatus
```

Its implementation directly invokes the Docker CLI against the mounted Unix socket. Keep execution behind the existing runtime-owned SSH adapter. Add persistence for Computer records under `/data` and reconciliation by immutable engine labels after a Server container restart.

Acceptance:

- Create a Computer from MacBook.
- Stop and restart the Dorka Server; the Computer is rediscovered.
- Launch a shell inside it from MacBook and mobile.
- No host home or repository path is mounted.

### Phase 2 — Agent roster and managed Computer placement

Add durable Agent records and make Agent the primary sidebar object. Keep the provider process and its PTY on the control plane. Record the selected Computer on each Run and route workspace operations through the managed execution adapter. Add “Run on…” and “Move next run to…” actions.

Acceptance:

- Multiple provider processes run concurrently on the control plane while targeting Computer A or B.
- Provider credentials and global skills/MCP are identical across Computer moves because the Server owns them.
- Moving Agent 1 from A to B changes the workspace, packages, Git/SSH identity, environment, secrets, and desktop available through tools.
- Computer-owned state does not follow Agent 1 to B or leak into the control plane.
- Closing MacBook does not stop any Agent.
- Mobile reconnects and can answer an Agent question.

### Phase 3 — Prove identity isolation

Build an end-to-end test with two Computers:

- Computer A has Git name/email/key A.
- Computer B has Git name/email/key B.
- Each clones and commits to a different test repository.
- Neither Computer can read the other's home or workspace volume.
- Moving one Agent from A to B changes its effective Git identity from A to B.
- The Server does not supply host Git config, SSH agent, workspace environment, or Computer secrets.
- The Computer cannot read provider credentials or control-plane global skills/MCP.

Also test the explicit shared boundary: two control-plane Agents targeting Computer A can reach the same workspace and Git identity only through the managed execution adapter.

### Phase 4 — Visual desktop vertical slice

Add Selkies to the curated Computer image. Proxy one authenticated desktop stream through the Server. Persist the desktop session and browser profile across client and Server reconnects.

Acceptance:

- Desktop and mobile can view and control the same Computer desktop.
- No Computer desktop port is host-published.
- An expired or wrong-Computer ticket cannot connect.
- Replacing the Server container does not end the Computer desktop session.
- A browser login remains present after reconnect.

### Phase 5 — Add an optional structured projection

Replace worktree-first navigation with a roster → session shell. Add progressive first-run provisioning, generated Agent characters, inline job suggestions, harness-backed capability cards, the transient Agent inspector, dedicated Computers view, desktop view, and explicit Run placement/move controls. Project structured chat only when the harness supplies structured events. Keep raw Terminal always available rather than hiding it behind the projection. Show a clear “shared with N Agents” warning wherever a Computer is selected.

Acceptance:

- Pairing a fresh Server automatically prepares the `Main` Computer and first Agent, with honest progress and retry states.
- The first useful screen asks what job the Agent should do; it does not ask the user to configure Docker, a repository, or a model.
- A suggested job can be selected inline, or replaced with free text.
- A missing capability appears inline with one action; Computer-bound authentication opens that Computer's desktop.
- A user can create another Computer or Agent from the same compact create surface.
- The user can move an Agent's next Run between Computers in two actions or fewer.
- Every destructive Computer action explains whether persistent volumes are retained or deleted.
- Desktop and mobile show the same Agent and Computer state.

### Phase 6 — Delete unreachable Orca features and relay

Once the vertical slice and direct connectivity are the defaults and tests cover them, delete old routes in dependency order:

1. task-provider and project-group UI;
2. user-managed SSH UI while retaining the internal adapter;
3. per-workspace environment recipe UI and compatibility glue;
4. old CDP browser screencast, local computer-use, and emulator surfaces after Selkies replaces them;
5. proprietary relay and cloud-account flows after direct pairing/reconnect tests pass;
6. integrations and account dashboards;
7. dead renderer stores, RPC methods, tests, dependencies, docs, mobile screens, and assets.

Run dead-code analysis after every deletion wave. Prefer ten reviewable deletion PRs over one unreviewable rewrite.

### Phase 7 — Production hardening

- Computer resource quotas and disk accounting.
- Network egress controls.
- Image allowlist and signed/pinned image references.
- Computer backup/export and explicit credential rotation.
- Server health endpoint and upgrade drain mode.
- Audit events for create/start/stop/delete, Agent placement, and credential-boundary changes.
- Firecracker spike only after a written threat model requires it.

## Current vertical-slice status

The current slice proves the **old placement mechanics**, not the corrected ownership model. It launches the provider process inside the Computer. That path is transitional and is a controlled-beta blocker until provider launch, provider credentials, and global skills/MCP move to the control plane and Computer operations cross the managed execution adapter.

The completed evidence remains useful for Computer lifecycle, isolation, reconnect, Git identity, PTY fencing, and UI mechanics:

```text
paired client
  -> authenticated Agent/Computer RPC
  -> durable Run placement
  -> server-owned Computer SSH key
  -> private-network managed relay
  -> incumbent PTY/session creation
  -> durable terminal + process identity
  -> Run-scoped Git status/diff/review
```

The retained Settings shell now exposes Computer lifecycle and Git identity, Agent presets and launch,
durable recent Runs, working-tree Diff, and provider-neutral Git-ref Review. Source-control requests are
keyed by `runId`; the Server resolves Computer placement, key path, and `/workspace` repository root.
No source-control request accepts a Computer ID, absolute repository path, SSH key path, or token.

Rootless Podman on macOS arm64 proved the real server image, persistent control/host keys, private SSH,
managed relay launch identity, immutable prompts, restart without duplicate launch, Computer-local Git
identity, working-tree Diff, and Git-ref Review under the transitional Computer-local provider launch.
Hidden paired-client QA then proved visible launch, reload-persistent Run history, and both Diff modes
without renderer errors; it does not accept the corrected process-placement boundary. Because the Computer image
is currently amd64, the full Selkies entrypoint timed out under emulation. The successful execution
proof used the same image and volumes with a diagnostic headless `sshd` entrypoint. Native amd64 Linux
remains the release gate for graphical startup. Evidence is in `/tmp/dorka-managed-computer-e2e.md` and
`/tmp/dorka-paired-run-ui-qa.md`.

Certified managed PTY exits move running Runs to `waiting`; transport loss and unverifiable SSH exits do
not. Startup recovery reconnects each active Run's already-running Computer once and never starts or
relaunches work. When the incumbent runtime can prove that a recovered terminal handle still names the
exact persisted process identity, recovery verifies the managed Computer target and re-arms the existing
PTY-exit observer. Missing handles, replaced incarnations, stopped Computers, and failed reattachment do
not mutate Run state. Computers and new Runs now carry an immutable execution generation, and the
relay has a crash-durable exact-certificate journal composed into certified-only exit writers and
capability-gated list/ack RPCs. Computer record migration and mutation are serialized across Server
processes sharing `/data`. The exact relay spawn request now fences generation before native PTY
creation. Startup and in-process reconnect recovery
validate bounded exact certificates, Run projection is identity-conditional and directory-synced, and
acknowledgement follows persistence. Native-Linux outage evidence remains the release gate.

## Local development: verified path

The current checkout requires Node 24 and pnpm 12. The following succeeded on macOS arm64:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck:node
pnpm run build:cli
pnpm run build:orcad
pnpm run smoke:orcad-terminal
```

The CLI build is usable without installing a global symlink:

```bash
./config/scripts/orca-dev.mjs --version
./config/scripts/orca-dev.mjs serve --help
```

The global `orca-dev` symlink could not be created because `/usr/local/bin` is not writable. Do not use `sudo` just for development; use the repository-local script.

Run the desktop development client without stealing focus:

```bash
ORCA_BACKGROUND_LAUNCH=1 pnpm dev
```

For a local headless Node server build:

```bash
pnpm run build:orcad
ORCA_USER_DATA="$PWD/.local/dorka-server" \
  node out/orcad/orcad.js --bind 127.0.0.1 --port 6768 --json
```

For the container topology prototype on macOS, Podman is installed and its existing machine was successfully started in rootless mode:

```bash
podman machine start
podman info
podman run --rm docker.io/library/alpine:3.22 sh -lc 'id; echo "$HOME"'
```

The verified host reported Linux arm64, rootless Podman, and successfully ran the Alpine container. Podman's Docker-compatible socket can stand in for Docker Engine during local development. Native Linux production will not need `podman machine`.

The initial deployable shape should be a `compose.yaml` similar to:

```yaml
services:
  dorka:
    image: ghcr.io/example/dorka-server:dev
    restart: unless-stopped
    environment:
      DORKA_DATA_DIR: /data
      DOCKER_HOST: unix:///var/run/docker.sock
    volumes:
      - dorka-data:/data
      - ${DORKA_ENGINE_SOCKET:-/var/run/docker.sock}:/var/run/docker.sock
    networks:
      - control
      - runtimes
    ports:
      - '6768:6768'

volumes:
  dorka-data:

networks:
  control: {}
  runtimes:
    name: dorka-runtimes
```

The Server creates Computer containers dynamically on `dorka-runtimes`; they are intentionally not static Compose services. On a rootless Docker host, set `DORKA_ENGINE_SOCKET=/run/user/<uid>/docker.sock`. Keep port 6768 private with Tailscale/WireGuard/firewall policy rather than exposing it directly to the public internet.

## Remote deployment target

Use the existing `orcad` plain-Node runtime rather than Electron-based `orca serve` as the long-term Server. The current Orca docs already say a remote server owns projects, worktrees, terminals, accounts, and sessions while clients provide UI. `orcad` removes the Electron/Xvfb dependency and already documents systemd supervision and terminal-daemon survival.

Production shape:

```text
Ubuntu/Debian Docker host
  ├── rootless Docker/Podman engine
  ├── dorka-server container + dorka-data volume
  ├── computer-a sibling container + private volumes
  └── computer-b sibling container + private volumes

Tailscale/WireGuard/private ingress
  ├── MacBook Dorka client
  └── Dorka mobile client
```

Do not claim that provider processes survive replacement of the control-plane container. The existing persistent local PTY daemon preserves Server-local Agent processes across an ordinary `dorkad` process restart, but replacing the container kills processes in its PID namespace. A replacement must recover exact terminal identity when the daemon survives, or preserve the Run as waiting/unverifiable unless host-certified process death is available. Never move provider processes into Computers merely to obtain restart continuity; Computers remain execution targets, not credential-bearing provider hosts.

Use one host model per machine. Do not register the same server both as a direct SSH host and as a paired Dorka Server.

## Sources

### Orca repository documentation

- [`docs/site/content/docs/ways-to-run.mdx`](../../docs/site/content/docs/ways-to-run.mdx) — remote server owns the runtime; clients share it; per-workspace environments can use local Docker.
- [`docs/site/content/docs/remote-servers.mdx`](../../docs/site/content/docs/remote-servers.mdx) — server/client ownership, pairing, mobile, and private-network guidance.
- [`docs/reference/headless-linux-server.md`](../reference/headless-linux-server.md) — current `orca serve` deployment and systemd behavior.
- [`docs/reference/orcad-operations.md`](../reference/orcad-operations.md) — plain-Node runtime, detached terminal daemon, data root, supervision, and limitations.
- [`docs/reference/ssh-execution-boundary.md`](../reference/ssh-execution-boundary.md) — execution-host authority and why a paired headless runtime is preferable for always-on work.
- [`src/shared/execution-host.ts`](../../src/shared/execution-host.ts) — existing local/SSH/paired-runtime ownership vocabulary.
- [`src/main/ipc/ephemeral-vm.ts`](../../src/main/ipc/ephemeral-vm.ts) — existing provision/connect/cleanup flow.

### External research

- [Grok Bot: Create and manage Bots](https://docs.x.ai/grok-bot/bots) — durable Bot identity, job, conversation, memory, small roster, and shared-computer warning.
- [Grok Bot: Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration) — messaging-first interaction, in-progress redirection, groups, and handoffs.
- [Grok Bot for teams and enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) — thin clients, dedicated Firecracker computer per user, and shared compute among that user's Bots.
- [Apple container technical overview](https://github.com/apple/container/blob/main/docs/technical-overview.md) — one lightweight VM per container on macOS and current limitations.
- [Docker Engine security](https://docs.docker.com/engine/security/) — namespace isolation and the high authority granted by Docker daemon access.
- [Docker rootless mode](https://docs.docker.com/engine/security/rootless/) — running daemon and containers inside a user namespace.
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) — private bridge networking and service-name discovery.
- [Podman rootless mode](https://docs.podman.io/en/stable/markdown/podman.1.html#rootless-mode) — user namespaces and rootless storage requirements for the local Docker-compatible development engine.
- [Podman system service](https://docs.podman.io/en/latest/markdown/podman-system-service.1.html) — Docker-compatible API/socket behavior and warning that API access grants arbitrary code execution as the service user.
- [Firecracker](https://firecracker-microvm.github.io/) — KVM architecture, startup, and memory-overhead claims.
- [Selkies documentation](https://docs.selkies.io/latest/) — browser desktop architecture, WebSocket default, WebRTC option, and container deployment.
- [Selkies Docker quick start](https://github.com/selkies-project/selkies/blob/main/docs/start.md) — desktop image, shared-memory requirement, authentication, TLS, and optional GPU devices.
- [Selkies firewall guide](https://github.com/selkies-project/selkies/blob/main/docs/firewall.md) — why WebRTC requires TURN/firewall configuration in container deployments.
- [noVNC](https://github.com/novnc/noVNC) — embeddable browser RFB client and WebSocket transport used as the fallback.
- [KasmVNC server documentation](https://www.kasmweb.com/kasmvnc/docs/latest/serverside.html) — browser/WebSocket model and Safari caveat considered in the desktop-streaming decision.
