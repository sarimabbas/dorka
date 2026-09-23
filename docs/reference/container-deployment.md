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
and make sure that path is shareable by the Compose provider.

`DORKA_SERVER_PORT` changes the published server port. The container still
listens on 6768. Compose creates `dorka-runtimes` as an internal network for
runtime traffic and a separate `dorka-control` network for the published server.
Computer instances are created dynamically by Dorka and are intentionally not
listed in `compose.yaml`.

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
`/home/ubuntu` and `/workspace`. SSH listens only inside the private network on
2222. Selkies listens there on 8080. Do not publish either port on the host.
The image inherits Selkies variables such as `PASSWD`, display sizing, TLS, and
GPU configuration. It must not run privileged; follow the upstream Selkies GPU
device instructions when acceleration is required.
