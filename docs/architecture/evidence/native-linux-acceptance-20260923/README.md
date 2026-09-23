# Native Linux acceptance evidence — 2026-09-23

This directory preserves the redacted release-gate result for Dorka commit
`33ca2607316fbf4fcc0cab7ac8170677899ce6e1`.

## Environment

- Host: `bfc5-et`
- Kernel: Linux 6.12.92, x86_64
- Runtime: Node 24.20.0
- Engine: Docker 28.3.3
- Engine mode: explicitly allowed, otherwise-empty rootful acceptance engine
- Images: native `linux/amd64`

## Command

The clean checkout ran `config/scripts/run-dorka-native-linux-acceptance.ts` with:

- `DORKA_ENGINE=docker`
- `DOCKER_HOST=unix:///var/run/docker.sock`
- `DORKA_ACCEPTANCE_ALLOW_ROOTFUL=1`
- `DORKA_ACCEPTANCE_SHA=33ca2607316fbf4fcc0cab7ac8170677899ce6e1`

## Result

All six cases passed:

1. Native Server and Computer builds.
2. Missing-image recovery.
3. Authenticated Selkies/SSH readiness with private ports and persistent identity.
4. Live Server replacement and unverifiable disconnect behavior.
5. Offline host-certified exit replay to the exact Run identity.
6. Projection-before-ack, failed-ack replay, and acknowledgement cleanup.

`runs-final.json` records both test Runs in `waiting` with unchanged Computer generation, terminal
handle, and process identity. `cleanup.json` records no failures or residue. A final direct engine
inventory confirmed zero containers, volumes, images, and custom networks.

Pairing URLs, credentials, private keys, and unredacted service logs are intentionally not retained.
