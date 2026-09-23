---
name: dorka-per-workspace-env
description: >-
  Set up, review, debug, or validate an Dorka per-workspace environment recipe: the
  on-demand, disposable runtime (cloud sandbox, VM, SSH host, or local container)
  Dorka creates fresh for each workspace. Use to stand up a new recipe end to end,
  fix an `environmentRecipes` entry in `dorka.yaml`, scaffold provider lifecycle
  scripts, or resolve an `dorka vm recipe doctor` failure. Use `dorka-cli` for
  ordinary worktree and workspace creation with no recipe involved.
---

# Per-Workspace Environments

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
DORKA skills get dorka-per-workspace-env
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Dorka is not running, start it with `DORKA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `DORKA open` or restart Dorka. If
`skills get` is unknown, explain that updating Dorka restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
