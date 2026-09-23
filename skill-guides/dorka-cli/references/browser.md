# Built-in browser commands

Use a snapshot-interact-re-snapshot loop:

```text
DORKA goto --url https://example.com --json
DORKA snapshot --json
DORKA click --element @e3 --json
DORKA snapshot --json
```

Common commands:

```text
DORKA goto --url <url> --json
DORKA back --json
DORKA reload --json
DORKA snapshot --json
DORKA screenshot --json
DORKA full-screenshot --json
DORKA pdf --json
DORKA click --element <ref> --json
DORKA fill --element <ref> --value <text> --json
DORKA type --input <text> --json
DORKA select --element <ref> --value <value> --json
DORKA check --element <ref> --json
DORKA scroll --direction down --amount 1000 --json
DORKA hover --element <ref> --json
DORKA focus --element <ref> --json
DORKA keypress --key Enter --json
DORKA upload --element <ref> --files <paths> --json
DORKA wait --text <text> --json
DORKA wait --url <substring> --json
DORKA wait --selector <css> --json
DORKA wait --load networkidle --json
DORKA eval --expression <js> --json
DORKA tab list --json
DORKA tab create --url <url> --json
DORKA tab switch --index <n> --json
DORKA tab close --index <n> --json
DORKA cookie get --json
DORKA capture start --json
DORKA console --limit 50 --json
DORKA network --limit 50 --json
DORKA exec --command "help" --json
```

Browser rules:

- Re-snapshot after navigation, tab switches, clicks that change the page, and any `browser_stale_ref`.
- Refs like `@e1` are assigned by `snapshot`, scoped to one tab, and invalidated by navigation or tab switch.
- Browser commands default to the current worktree and its active tab. Use `--worktree all` only intentionally.
- For concurrent browser work, run `DORKA tab list --json`, read `tabs[].browserPageId`, and pass `--page <browserPageId>` on later commands.
- Use typed tab commands (`DORKA tab list/create/close/switch`), not `DORKA exec --command "tab ..."`, so Dorka keeps UI state synchronized.
- Prefer `wait --text`, `--url`, `--selector`, or `--load` after async page changes instead of bare timeouts.
- Anything not listed above goes through `DORKA exec --command "<agent-browser command>"`.
- If `fill` or `type` fails on a custom input, try `DORKA focus --element @e1 --json` then `DORKA inserttext --text "text" --json`.
- A client-hosted page renders in the paired desktop's browser engine, so every command against it needs that desktop online and returns `browser_host_unavailable` while it is closed, asleep, or disconnected. Server-hosted pages run with no desktop attached; prefer them for long or unattended automation.

Common recoveries:

- `browser_no_tab`: open a tab with `DORKA tab create --url <url> --json`.
- `browser_stale_ref`: run `DORKA snapshot --json` and retry with fresh refs.
- `browser_tab_not_found`: run `DORKA tab list --json` before switching or closing.
- `browser_host_unavailable`: the desktop hosting the page is offline. Bring it back, or recreate the page with server placement if the work must outlive the desktop session.
