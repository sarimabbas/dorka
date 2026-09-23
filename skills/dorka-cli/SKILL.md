---
name: dorka-cli
description: >-
  Operate Dorka-managed worktrees, folder contexts, terminals, repos, automations, artifacts,
  skill sharing, worktree comments, and Dorka's embedded browser through the `dorka` CLI. Use
  when the user says "$dorka-cli", "Dorka worktree", "child worktree", "spawn codex/claude in a
  worktree", "read/wait/send Dorka terminal", "handoff" / "handover" / "give this to another
  agent", "Dorka browser", "dorka artifacts", or "share skills". Prefer it over raw git
  worktree, ad hoc PTYs, or Computer Use when Dorka state is involved. Use Computer Use only
  when a visible window needs GUI control that a CLI, filesystem, or API cannot do.
---

# Dorka CLI

This discovery stub loads the version-matched guide from the Dorka executable used for this session.

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
DORKA skills get dorka-cli
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Dorka is not running, start it with `DORKA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `DORKA open` or restart Dorka. If
`skills get` is unknown, explain that updating Dorka restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
