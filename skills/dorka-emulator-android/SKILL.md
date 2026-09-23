---
name: dorka-emulator-android
description: >-
  Android device and emulator control from inside Dorka over adb, with the live
  device view in Dorka's emulator pane. Use when driving an adb-connected emulator
  or phone on Windows, Linux, or macOS: booting AVDs, taps, swipes, typing,
  hardware buttons, rotation, app install and launch, runtime permissions, the
  accessibility tree, and logcat. For an iOS simulator use the iOS emulator
  skill; build the APK with Gradle first.
license: Apache-2.0
---

# Dorka Emulator (Android)

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
DORKA skills get dorka-emulator-android
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Dorka is not running, start it with `DORKA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `DORKA open` or restart Dorka. If
`skills get` is unknown, explain that updating Dorka restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
