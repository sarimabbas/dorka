# Container deployment

Dorka runs the server and each Computer as sibling containers. The server talks
to the host container engine through its Unix socket; it does not run Docker or
Podman inside the container.

```text
client -> :6768 dorka-server -> /var/run/docker.sock -> sibling Computers
                               \-> dorka-runtimes (private network)
```

## Start the server

The multi-stage server image installs the checkout's locked dependencies, runs
`pnpm run build:dorkad`, and copies the plain Node server plus its production
modules into the runtime image. It does not download an Orca release or start
Electron. The server runs as the unprivileged `dorka` user. `/data` holds the
server profile and must remain persistent.

Build or pull the Computer image before the first server start if you want Dorka
to provision `Main` immediately. A missing image no longer stops the server, but
Computer provisioning remains degraded until the image exists:

```bash
docker build --platform linux/amd64 -f docker/computer/Dockerfile \
  -t dorka-computer:selkies .
```

### Docker

Rootful Docker uses the default socket. Build and start the current checkout:

```bash
docker compose up -d --build
docker compose ps
docker compose logs dorka-server
```

For rootless Docker, point `DORKA_ENGINE_SOCKET` at the daemon owned by your
login user:

```bash
export DORKA_ENGINE_SOCKET="${XDG_RUNTIME_DIR}/docker.sock"
docker compose up -d --build
```

The bind mount always appears as `/var/run/docker.sock` inside the server, and
`DOCKER_HOST=unix:///var/run/docker.sock` tells the bundled Docker CLI where to
connect. The entrypoint adds the unprivileged server user to the socket's
numeric group at startup, then runs `node /opt/dorka/out/dorkad/dorkad.js`.

### Podman

Enable the user socket and use Docker Compose against it:

```bash
systemctl --user enable --now podman.socket
export DORKA_ENGINE_SOCKET="${XDG_RUNTIME_DIR}/podman/podman.sock"
export DOCKER_HOST="unix://${DORKA_ENGINE_SOCKET}"
docker compose up -d --build
```

Or use the equivalent Podman Compose command with the same socket variable:

```bash
DORKA_ENGINE_SOCKET="${XDG_RUNTIME_DIR}/podman/podman.sock" podman compose up -d --build
```

On macOS or Windows, use the socket path reported by `podman machine inspect`
and make sure that path is shareable by the Compose provider. Compose disables
SELinux labeling for the server container so rootless Podman can access its
mounted API socket. This does not make the container privileged; the socket still
grants authority over resources owned by that rootless engine user.

`DORKA_SERVER_PORT` changes the published server port. The container listens on
`0.0.0.0:6768`; device pairing still authenticates clients before exposing runtime
operations. Compose creates `dorka-runtimes` as an internal network for
runtime traffic and a separate `dorka-control` network for the published server.
Computer instances are created dynamically by Dorka and are intentionally not
listed in `compose.yaml`.

## Computer environment and premounted paths

A Computer create request may include ordinary string environment variables.
Names must use the portable `NAME` form and both names and values are bounded.
Dorka passes each value as one `--env` argument; callers cannot add container
engine flags.

Environment values are persisted in `/data/computers.json`. **Do not put secrets
in them.** Secret references and runtime injection are a future seam; they must
resolve through a dedicated secret store without persisting plaintext in the
Computer spec.

Host paths are denied by default. An operator may expose an exact set of paths
that are already mounted into `dorka-server` at the same absolute paths. Set
`DORKA_COMPUTER_MOUNT_ALLOWLIST` to a JSON array, then add the matching server
bind mounts in a Compose override:

```yaml
services:
  dorka-server:
    environment:
      DORKA_COMPUTER_MOUNT_ALLOWLIST: '["/srv/dorka-shared"]'
    volumes:
      - /srv/dorka-shared:/srv/dorka-shared
```

A Computer request can then mount `/srv/dorka-shared` at a normalized absolute
container target. Mounts default to read-only; writable access must be explicit.
The source must exactly match the allowlist. Parent-directory and prefix matches
do not count. Dorka rejects home directories, engine/runtime paths, device and
kernel filesystems, duplicate targets, and attempts to replace the managed home,
workspace, or engine-socket target.

The allowlist is configuration, not a general bind-mount API. Never add the
engine socket, a host home, `/`, `/dev`, `/proc`, `/sys`, or `/run`. Computer
containers never receive the engine socket or host home, never run privileged,
and cannot request arbitrary engine flags or unconstrained host mounts.

## Computer SSH keys

Dorka creates one Ed25519 keypair per Computer under
`/data/computer-ssh-keys/<computer-id>/`. The private key stays on the Server at
mode `0600`. Reconciliation reuses it when recreating a missing container.

Only the public key enters the Computer through `DORKA_SSH_PUBLIC_KEY`. The
entrypoint preserves unrelated `authorized_keys` lines, deduplicates the managed
key, and disables password and keyboard-interactive SSH authentication.

## Build the Computer image

The curated Computer extends an official, persistent Selkies desktop tag. It
adds SSH and common agent-runner prerequisites, keeps desktop and SSH sessions
on the unprivileged `ubuntu` account, and declares persistent home and workspace
mount points.

The pinned Selkies image currently publishes `linux/amd64` only:

```bash
docker build --platform linux/amd64 -f docker/computer/Dockerfile \
  -t dorka-computer:selkies .
```

To validate a newer official persistent tag before adopting it:

```bash
docker build --platform linux/amd64 -f docker/computer/Dockerfile \
  --build-arg SELKIES_IMAGE=ghcr.io/selkies-project/nvidia-glx-desktop:<persistent-tag> \
  -t dorka-computer:selkies .
```

Dorka attaches Computers to `dorka-runtimes` and mounts persistent storage at
`/home/ubuntu`, `/workspace`, and `/etc/ssh`. The last volume preserves each
Computer's SSH host identity across container replacement. SSH listens only inside
the private network on 2222. Selkies listens there on 8080. Do not publish either
port on the host.
The image inherits Selkies variables such as `PASSWD`, display sizing, TLS, and
GPU configuration. It must not run privileged; follow the upstream Selkies GPU
device instructions when acceleration is required.
