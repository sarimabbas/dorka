# Final native Linux readiness evidence — 2026-09-23

This directory records the final self-service native release gate for commit
`1a3755ba6f46cdf10091c1b8b41dc6df33f1a948` on native Linux amd64 with Docker 28.3.3.

Command:

```bash
pnpm run test:e2e:dorka-native-linux:self-service
```

The environment selected the otherwise-empty rootful Docker fallback explicitly with
`DORKA_ACCEPTANCE_ALLOW_ROOTFUL=1`. The gate emitted:

```text
DORKA_NATIVE_LINUX_ACCEPTANCE=PASS
artifacts=/tmp/dorka-99-final-gate
```

All seven cases passed:

1. native Server and Computer builds;
2. missing-image recovery;
3. two-Computer isolation, Agent movement, and Agent requirements;
4. private Computer ports plus authenticated Selkies and SSH readiness;
5. live replacement and disconnect behavior;
6. offline certified-exit replay;
7. projection-before-ack and failed-ack replay.

`cleanup.json` and `summary.json` record an attempted cleanup with no failures or residue. The retained
files are the harness's bounded, redacted evidence. Raw build logs, pairing URLs, private keys, tokens,
and transient runtime state are intentionally excluded.
