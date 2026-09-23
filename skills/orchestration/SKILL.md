---
name: orchestration
description: >-
  Coordinate supervised Dorka workers: threaded messages, blocking ask/reply,
  task dispatch, worker_done/escalation waits, task DAGs, decision gates,
  coordinator loops, and decomposing work across agents. Use `dorka-cli` for full
  ownership handoffs — "hand off", "handoff", "handover", "give this to another
  agent", "another worktree" — unless asked to supervise, monitor, or coordinate
  a DAG, and for terminal control, lightweight terminal prompts, shell commands,
  Dorka worktree management, and reading or waiting on terminals.
---

# Dorka Orchestration

This file is a discovery stub, not the usage guide. The full, version-matched Dorka
orchestration reference is served by the `dorka` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage Dorka orchestration whenever you need structured multi-agent coordination: threaded
messages, blocking ask/reply flows, task dispatch, worker_done/escalation waits, task DAGs,
decision gates, coordinator loops, or decomposing work across agents. Use the dorka-cli skill
instead for full ownership handoffs ("hand off", "handoff", "handover", "give this to
another agent", "another worktree") when the user did not ask to supervise, monitor, wait
for results, or coordinate a DAG — and for ordinary terminal control, shell commands,
worktree management, and the built-in browser. Coordination requires real Dorka runtime
state; never substitute a non-Dorka subagent tool.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `DORKA_CLI_COMMAND` environment variable is set, use its value. Dorka exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `DORKA_DEV_REPO_ROOT`, use `dorka-dev`.
- Otherwise, on Linux outside an Dorka-managed terminal, use `dorka-ide`. Never run bare
  `dorka` there — outside Dorka's terminals it normally resolves to the
  GNOME Dorka screen reader (`/usr/bin/dorka`) and starts speech on the user's machine.
- Otherwise, use `dorka`.

Below, `DORKA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `DORKA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Dorka build.

## Load the version-matched guide before running Dorka commands

```text
DORKA skills get orchestration
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal local coordinator loop. For a conditional action gate
such as remote placement, uncertain release recovery, or expanded DAG work, load only the
reference that gate names with
`DORKA skills get orchestration --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`DORKA skills get orchestration --full` and read the named bundled reference before acting.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Dorka is not running, start it with `DORKA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `DORKA open` or restart Dorka. If
`skills get` is unknown, explain that updating Dorka restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
