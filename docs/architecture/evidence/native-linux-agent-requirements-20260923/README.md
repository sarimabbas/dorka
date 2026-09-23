# Native Linux Agent-requirements acceptance

This directory records the redacted release-gate result for commit
`06e25b7160b9d202e276013fb7cf6ec69cc3b6ea` on the disposable native amd64 host
`bfc5-et` with Docker 28.3.3.

## Command

```bash
DORKA_ENGINE=docker \
DOCKER_HOST=unix:///var/run/docker.sock \
DORKA_ACCEPTANCE_ALLOW_ROOTFUL=1 \
DORKA_ACCEPTANCE_SHA=06e25b7160b9d202e276013fb7cf6ec69cc3b6ea \
DORKA_ACCEPTANCE_ARTIFACTS=/tmp/dorka-native-final-gate \
pnpm test:e2e:dorka-native-linux
```

The rootful fallback was used only after confirming that the disposable engine had zero containers,
volumes, images, and custom networks.

## Result

All seven cases passed. The combined two-Computer case proved that the production dorkad composition:

- advertised `agents.references.v1`;
- launched with a Computer-local global skill and enabled workspace MCP server;
- snapshotted the exact Agent revision on the successful Run;
- rejected a uniquely named missing skill before terminal/process/shim launch;
- rejected a disabled MCP server before terminal/process/shim launch; and
- preserved strict Agent revision progression.

The remaining cases proved native image construction, missing-image recovery, Computer isolation and
Agent movement, private graphical/SSH ports, Server replacement, disconnect semantics, offline exit
replay, projection-before-ack, and failed-ack replay.

`cleanup.json` and a post-run engine inventory both reported zero residue. The harness removed all
containers, volumes, images, and custom networks. Pairing credentials and private keys are not retained.

## Retained files

- `summary.json` — redacted case results and cleanup verdict.
- `agent-requirements.json` — requirement, revision, successful Run, and pre-spawn failure evidence.
- `two-computer-isolation.json` — isolated placement and identity evidence.
- `cleanup.json` — harness cleanup result.
- `exit-code` — `0`.
