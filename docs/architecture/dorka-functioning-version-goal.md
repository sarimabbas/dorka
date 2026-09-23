# Dorka functioning-version goal

## Outcome

Within this implementation sprint, deliver a locally runnable Dorka build that recomposes the
existing Orca application instead of replacing it with a parallel shell.

```text
Existing Orca UI + terminal/PTY core
  -> remove rejected product surfaces
  -> retain proven tabs, settings, diff, review, and automations
  -> adapt execution around Agents and Computers
  -> launch and smoke-test the integrated build
```

## Product constraints

- Preserve the existing Orca UI paradigm and user muscle memory.
- Use Grok Bot only as restrained visual inspiration.
- Keep terminal sessions and existing CLI harnesses as the execution core.
- Treat an Agent as a durable CLI-harness launch preset plus prompt.
- Treat a Computer as the credential, filesystem, application, and desktop boundary.
- Keep the server headless and remotely accessible.

## Definition of functioning

A build is functioning when it launches locally and a tester can use the existing application shell
to select a Server, inspect a Computer, launch an Agent Run, read its terminal output and history,
and open Diff/Review and Automations without encountering visible navigation for eliminated product
surfaces. Agent and Computer records must survive restart, and the server container must start and
accept remote client connections.

## Checklist

### Foundation

- [x] Rename the product to Dorka while preserving required compatibility reads.
- [x] Define Agent, Run, Computer, and Server as the four first-class objects.
- [x] Make Agents terminal-first CLI-harness launch presets.
- [x] Implement durable Agent and Run storage.
- [x] Implement persistent Computer container lifecycle records and reconciliation.
- [x] Build `dorkad` from source in the server container.
- [x] Bind the server container to an externally reachable address.
- [x] Verify the server container accepts TCP connections.

### Recompose the existing application

- [x] Remove the temporary parallel Dorka shell entry path.
- [x] Preserve the existing application shell and tab behavior.
- [x] Keep the existing Settings experience with only supported sections visible.
- [x] Keep the existing local diff viewer.
- [x] Keep provider-neutral Review as Git-ref comparison inside the selected Run's Computer.
- [x] Keep Automations for scheduled or repeated Agent launches.
- [x] Expose durable Agent presets and Computer lifecycle state in the retained Settings shell.
- [x] Make Agents and Computers first-class retained-shell navigation entries.
- [x] Replace the dead local Computer state with actionable Server onboarding.
- [x] Expose a Run's real terminal output alongside history and Diff/Review.
- [ ] Complete the remaining Dorka terminology pass without changing the UI paradigm.

### Eliminate from the product UI

- [x] Remove the bottom status bar.
- [x] Remove Commands and Quick Commands product surfaces.
- [x] Remove Tasks and Kanban navigation.
- [x] Remove relay setup, status, and navigation.
- [x] Remove dedicated GitHub integration and sign-in surfaces.
- [x] Remove dedicated Linear integration and sign-in surfaces.

### Runtime integration

- [x] Compose `AgentRosterStore` during `dorkad` startup.
- [x] Compose `ComputerRuntimeManager` during `dorkad` startup.
- [x] Expose the minimal authenticated Agent and Computer control-plane operations.
- [x] Provision an idempotent `Main` Computer and first Agent.
- [x] Connect the Agent execution seam to a concrete managed-Computer SSH launcher and the existing PTY/session path.
- [x] Record the selected `computerId`, terminal session identity, and process identity on each launched Run.
- [x] Expose durable Run history and Run-scoped working-tree Diff/Review in the retained Settings shell.
- [x] Project certified managed PTY exits to `waiting` without treating transport loss as process death.
- [x] Configure persistent Computer-local Git name/email without exposing host credentials.
- [x] Support validated ordinary environment variables and exact operator-allowlisted Computer premounts.
- [x] Provision one persistent server-owned SSH control key per Computer, inject only its public key, and disable password authentication.
- [x] Package the incumbent relay with the server image and compose the Node-safe managed SSH session owner in `dorkad`.
- [x] Keep Computer lifecycle mutation ordering inside `ComputerRuntimeManager`.
- [x] Omit unconfigured artifact, account, and plugin RPC families from the `dorkad` bundle and capability catalog.

### Validation and handoff

- [x] Pass focused unit and component tests for every changed seam.
- [x] Pass Node and renderer typechecks.
- [x] Build `dorkad` and the web/desktop application.
- [x] Launch the integrated application for manual testing.
- [x] Smoke-test tabs, Settings, Diff, Review, Automations, and managed terminal launch.
- [x] Record remaining deferred work without presenting it as completed.

## Remaining functional gaps

- Hidden Electron/CDP QA against `/tmp/dorka-computer-use-qa-repo` passed project add, Settings,
  tabs, local terminal execution, local Diff, and Automations with no renderer errors. A second
  isolated paired-Server pass proved visible Agent launch, durable Run history after reload,
  Computer-local working-tree Diff, and provider-neutral Review. Evidence is recorded in
  `/tmp/dorka-computer-use-qa.md` and `/tmp/dorka-paired-run-ui-qa.md`.
- Native amd64 Docker on `bfc5-et` proved the pinned GPU-optional Selkies image, authenticated desktop
  readiness, private SSH/Desktop ports, outbound NAT, persistent SSH host and desktop-password
  identity, first-run `Main` provisioning, missing-image recovery, healthy service restart, managed
  SSH/relay/PTY launch, and Server replacement without relaunch. Rocky 9's rootless Podman/cgroups-v1
  setup cannot create the required container cgroup, so the gate supports an explicitly enabled,
  otherwise-empty isolated Docker engine rather than emulation or weakened assertions.
- A hidden Electron/CDP pass paired the desktop through a private SSH tunnel, displayed the native
  `Main` Computer, launched the default Agent, persisted the Run, and read the real terminal output
  from its authoritative terminal handle. Agents and Computers are now reachable directly from the
  existing two-pane shell.
- Server restart reconnects each active Run's running Computer once without starting stopped
  Computers or relaunching work. For an exactly reattached terminal handle and process identity, it
  verifies Computer ownership and re-arms the incumbent PTY-exit observer. Exact offline certificates
  project only the matching Run identity and are acknowledged only after durable persistence.
  The focused PTY reproducer proved the prior fixture's interactive owning shell ignored `SIGTERM`.
  The fixture now uses `SIGKILL`, which closes the PTY in isolation. One final clean native Selkies
  run must still prove certificate publication, projection-before-ack, and replay end to end.
- Agent skill and MCP references are not yet versioned or resolved at launch. They must remain
  separate from Computer-owned credentials, provider homes, packages, and filesystems.
- Existing Project and Workspace language still needs a careful Dorka terminology pass. This must
  not erase useful Git/worktree distinctions.
- Browser-hosted graphical Computer desktop proxying and scoped access tickets remain post-MVP
  runtime integration.

## Explicitly deferred unless required for the smoke test

- Production-grade Selkies ticket issuance and reverse proxying.
- Full deletion of every unreachable legacy module.
- Public capability marketplace.
- Mandatory Dorka cloud account or proprietary relay.
