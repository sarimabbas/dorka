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

A build is functioning when it launches locally and a tester can use the existing application
shell to open terminal tabs, settings, diffs, review, and automations without encountering visible
navigation for eliminated product surfaces. Agent and Computer records must survive restart, and
the server container must start and accept remote client connections.

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
- [ ] Keep the existing local diff viewer.
- [ ] Keep PR Review using credentials and tools inside the selected Computer.
- [ ] Keep Automations for scheduled or repeated Agent launches.
- [ ] Apply Dorka terminology and restrained visual polish without changing the UI paradigm.

### Eliminate from the product UI

- [x] Remove the bottom status bar.
- [ ] Remove Commands and Quick Commands product surfaces.
- [x] Remove Tasks and Kanban navigation.
- [ ] Remove relay setup, status, and navigation.
- [ ] Remove dedicated GitHub integration and sign-in surfaces.
- [ ] Remove dedicated Linear integration and sign-in surfaces.

### Runtime integration

- [x] Compose `AgentRosterStore` during `dorkad` startup.
- [x] Compose `ComputerRuntimeManager` during `dorkad` startup.
- [x] Expose the minimal authenticated Agent and Computer control-plane operations.
- [x] Provision an idempotent `Main` Computer and first Agent.
- [ ] Connect an Agent preset to the existing launcher and PTY/session path.
- [ ] Record the selected `computerId` and terminal session identity on each Run.

### Validation and handoff

- [ ] Pass focused unit and component tests for every changed seam.
- [ ] Pass Node and renderer typechecks.
- [ ] Build `dorkad` and the web/desktop application.
- [ ] Launch the integrated application for manual testing.
- [ ] Smoke-test tabs, settings, diff, review, automations, and terminal launch.
- [ ] Record remaining deferred work without presenting it as completed.

## Explicitly deferred unless required for the smoke test

- Production-grade Selkies ticket issuance and reverse proxying.
- Full deletion of every unreachable legacy module.
- Public capability marketplace.
- Mandatory Dorka cloud account or proprietary relay.
