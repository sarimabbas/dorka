# Native Linux two-Computer isolation evidence — 2026-09-23

This directory preserves the redacted acceptance result for Dorka commit
`d1967b2ec2da5e184a32e6fe7a4b9219ce0fe8cb`.

## Environment

- Host: `bfc5-et`
- Kernel: Linux 6.12.92, x86_64
- Runtime: Node 24.21.0
- Engine: Docker 28.3.3
- Engine mode: explicitly allowed, otherwise-empty rootful acceptance engine
- Images: native `linux/amd64`

## Result

All seven cases passed. The new isolation case proved:

1. `Main` and `Secondary` used distinct named home, workspace, and SSH-host-key volumes.
2. Different marker values at identical home/workspace paths survived both Computer restarts.
3. Different Git identities set through product RPC survived restart and remained isolated.
4. The durable Agent moved to `Secondary`.
5. Its next Run recorded Secondary's execution generation and SSH process identity.
6. Terminal output reached `DORKA_NATIVE_AGENT_READY` on Secondary.
7. A workspace exit marker written only to Secondary completed that Run.

The pre-existing native build, authenticated desktop, private-port, outbound-NAT, Server replacement,
unverifiable-disconnect, offline exit replay, projection-before-ack, and failed-ack replay cases also
remained green. `cleanup.json` and a direct post-run engine inventory confirmed zero containers,
volumes, images, or custom networks. The remote checkout, logs, artifacts, and package-install log were
removed after these redacted files were copied.

Pairing URLs, credentials, private keys, and unredacted service logs are intentionally not retained.
