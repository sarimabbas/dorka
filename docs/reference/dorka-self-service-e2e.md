# Dorka native Linux + macOS self-service E2E runbook

This runbook defines two unambiguous gates. The **native release gate** is sections 0–3 and was last
verified on 2026-09-23 at commit `06e25b716` on native amd64 Docker 28.3.3. The **controlled
paired-client E2E gate** is the complete runbook: sections 0–9 are all required, including exact cleanup.

## Purpose and pass condition

Use this runbook to validate one reviewed Dorka checkout on:

```text
macOS Dorka client
  -> SSH local forward (127.0.0.1:16768)
  -> disposable native Linux/amd64 host
  -> dorka-server container
  -> private dorka-runtimes network
  -> sibling dorka-computer-main container
```

The controlled paired-client E2E gate passes only when:

1. the repository's automated native-Linux acceptance gate passes;
2. a macOS client pairs through the private SSH tunnel;
3. the client sees the native `Main` Computer and default Agent;
4. a fixture Agent Run emits `DORKA_NATIVE_AGENT_READY`;
5. the client reconnects after Server replacement without replacing the Computer or relaunching the Run;
6. the exact Run completes after its fixture exit marker is written;
7. cleanup reports no named containers, volumes, or custom networks.

**Stop at the first failed check.** Preserve only the redacted evidence described below, then run cleanup. Do not continue to turn one failure into several ambiguous failures.

## Safety boundaries

- Use a disposable **native** Linux `x86_64`/`amd64` host. Emulated amd64 on macOS is not release evidence.
- Prefer a rootless Docker or Podman engine owned by the test account.
- If using rootful Docker, use an otherwise-empty disposable engine and set `DORKA_ACCEPTANCE_ALLOW_ROOTFUL=1` only after the inventory check below is empty.
- Engine-socket access is equivalent to control of everything owned by that engine user. Never expose the socket over TCP.
- Publish the Server only on host loopback. Reach it from macOS through SSH forwarding. Never expose port 6768 to the public internet.
- Never publish Computer ports 2222 or 8080. The expected output of `docker port dorka-computer-main` is empty.
- The pairing URL is a credential. Do not paste it into chat, tickets, shell history, screenshots, or retained logs.
- Use the repository's fixture Agent shim. Do not add provider credentials or use a real repository. The checkout is only a build input; managed Computers use disposable named volumes.
- Do not put secrets in Computer environment variables. They persist in `/data/computers.json` and cross the engine command boundary.
- Do not mount the host home, source checkout, engine socket, `/`, `/dev`, `/proc`, `/sys`, or `/run` into a Computer.
- A disconnected client or Server is not evidence that a Run exited. Accept only the product verdicts `live`, `unverifiable`, and `exited`.
- The macOS steps are manual product checks. Dorka UI automation must instead use the repository's hidden Electron/CDP harness with `DORKA_BACKGROUND_LAUNCH=1`; do not automate a visible desktop.

## Prerequisites

### Native Linux/amd64 host

- A fresh checkout of the reviewed Dorka commit.
- Linux `x86_64`/`amd64`.
- At least 4 CPUs, 16 GiB RAM, and 60 GiB free in the engine store.
- An unprivileged login user.
- Node 24, Corepack, pnpm 12, Git, the `docker` CLI with Compose v2, and either Docker Engine or a rootless Podman Docker-compatible API socket.
- SSH reachable from the macOS client.
- Outbound HTTPS for image and package pulls.

### macOS client

- A current Dorka desktop build compatible with the Server checkout.
- SSH access to the disposable host.
- A disposable Dorka profile or disposable macOS test account. Do not use a profile holding important paired servers.

## 0. Set run values

Run on the **Linux host**, from the Dorka checkout:

```bash
set -euo pipefail
export DORKA_E2E_SHA="$(git rev-parse HEAD)"
export DORKA_E2E_ARTIFACTS="$HOME/dorka-self-e2e-$DORKA_E2E_SHA"
mkdir -m 0700 "$DORKA_E2E_ARTIFACTS"
printf 'commit=%s\n' "$DORKA_E2E_SHA" >"$DORKA_E2E_ARTIFACTS/run.txt"
```

Record the host SSH name separately on macOS as `<linux-host>`. Do not put credentials in the artifact directory.

## 1. Host preflight

Run on the **Linux host**:

```bash
set -euo pipefail
test "$(uname -s)" = Linux
test "$(uname -m)" = x86_64
test "$(node -p 'process.versions.node.split(`.`)[0]')" = 24
test "$(git status --porcelain)" = ""
test "$(git rev-parse HEAD)" = "$DORKA_E2E_SHA"
corepack pnpm --version
nproc
grep MemTotal /proc/meminfo
```

Expected:

- every `test` is silent and exits 0;
- pnpm reports major version 12;
- `nproc` is at least 4;
- `MemTotal` is at least 16 GiB.

Configure one engine.

### Rootless Podman (preferred)

```bash
systemctl --user enable --now podman.socket
export DORKA_ENGINE=podman
export DORKA_ENGINE_SOCKET="${XDG_RUNTIME_DIR}/podman/podman.sock"
export DOCKER_HOST="unix://${DORKA_ENGINE_SOCKET}"
test -S "$DORKA_ENGINE_SOCKET"
podman info --format json | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const x=JSON.parse(s); if(x.host?.os!=="linux"||!["amd64","x86_64"].includes(x.host?.arch)||x.host?.security?.rootless!==true) process.exit(1)
})'
```

### Disposable rootful Docker (fallback only)

```bash
export DORKA_ENGINE=docker
export DORKA_ENGINE_SOCKET=/var/run/docker.sock
export DOCKER_HOST=unix:///var/run/docker.sock
export DORKA_ACCEPTANCE_ALLOW_ROOTFUL=1
test -S "$DORKA_ENGINE_SOCKET"
test -z "$(docker ps -aq)"
test -z "$(docker volume ls -q)"
test -z "$(docker network ls --format '{{.Name}}' | grep -Ev '^(bridge|host|none)$' || true)"
```

**Stop** if the rootful inventory is not empty. Do not delete pre-existing resources to make the check pass.

Check store capacity:

```bash
store="$($DORKA_ENGINE info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
test -n "$store" || store=.
test "$(df -Pk "$store" | awk 'NR==2 {print $4}')" -ge 62914560
```

Expected: exit 0 (at least 60 GiB free).

## 2. Run the one-command native release gate

Run on the **Linux host**:

```bash
export DORKA_ACCEPTANCE_SHA="$DORKA_E2E_SHA"
export DORKA_ACCEPTANCE_ARTIFACTS="$DORKA_E2E_ARTIFACTS/native-acceptance"
export DORKA_ENGINE
export DOCKER_HOST
corepack pnpm run test:e2e:dorka-native-linux:self-service
```

The command installs locked dependencies without package lifecycle scripts, runs the fast contract
suite, and starts the existing native acceptance harness. It does not build the desktop app or install
a global CLI because neither is used by this gate.

**Stop** on any failure. A preflight rejection writes bounded failure evidence but does not clean up
fixed-name resources because the run did not acquire ownership of them.

## 3. Verify the automated verdict

For the rootful fallback, keep `DORKA_ACCEPTANCE_ALLOW_ROOTFUL=1` exported. The harness itself:

For the rootful fallback, keep `DORKA_ACCEPTANCE_ALLOW_ROOTFUL=1` exported. The harness itself:

- builds native `linux/amd64` Server and Selkies Computer images;
- proves missing-image recovery;
- provisions `Main` and `Secondary`;
- verifies authenticated desktop/SSH readiness, outbound NAT, and no published Computer ports;
- verifies separate home/workspace/SSH identity and Git configuration;
- moves an Agent's next Run between Computers;
- replaces the Server without relaunching live work;
- verifies disconnect remains `unverifiable`;
- verifies offline certified exit replay and failed-ack replay;
- redacts retained pairing URLs, keys, and tokens;
- removes its containers, volumes, images, and networks in `finally`.

Expected terminal verdict:

```text
DORKA_NATIVE_LINUX_ACCEPTANCE=PASS
artifacts=/home/<user>/dorka-self-e2e-<sha>/native-acceptance
```

Verify the retained result:

```bash
test "$(cat "$DORKA_E2E_ARTIFACTS/native-acceptance/exit-code")" = 0
node -e '
const s=require(process.argv[1]);
if(s.cleanup.residue.length) process.exit(1);
if(!s.cases.length || s.cases.some(x=>x.status!=="passed")) process.exit(1)
' "$DORKA_E2E_ARTIFACTS/native-acceptance/summary.json"
```

Both commands must exit 0. **Stop** if `exit-code` is not 0 or cleanup residue is non-empty. The failure bundle is already redacted; do not add raw engine logs to it.

## 4. Build the disposable interactive topology

The automated gate cleans its resources. Now build a fresh interactive topology using the same repository Dockerfiles and fixture shim.

Run on the **Linux host**:

```bash
set -euo pipefail
$DORKA_ENGINE build --pull --platform linux/amd64 \
  -f docker/computer/Dockerfile \
  -t dorka-computer:selkies .
$DORKA_ENGINE build --platform linux/amd64 \
  --build-arg BASE_IMAGE=dorka-computer:selkies \
  -f tests/e2e/fixtures/dorka-native-linux-computer/Dockerfile \
  -t dorka-computer:self-e2e .
```

Expected:

```bash
test "$($DORKA_ENGINE image inspect dorka-computer:self-e2e --format '{{.Os}}/{{.Architecture}}')" = linux/amd64
```

Create a local Compose override. It advertises the macOS end of the SSH tunnel and installs no credentials:

```bash
cat > /tmp/dorka-self-e2e.override.yaml <<'YAML'
services:
  dorka-server:
    command:
      - --json
      - --bind
      - 0.0.0.0
      - --port
      - "6768"
      - --pairing-address
      - 127.0.0.1:16768
    environment:
      DORKA_DEFAULT_HARNESS: pi
      DORKA_DEFAULT_AGENT_PROMPT: Dorka self E2E fixture agent.
YAML
```

Start with the repository Compose file. `DORKA_SERVER_PORT` includes a host address so the Server is loopback-only:

```bash
export DORKA_COMPUTER_IMAGE=dorka-computer:self-e2e
export DORKA_SERVER_PORT=127.0.0.1:16768
export DORKA_ENGINE_SOCKET
export DOCKER_HOST

docker compose -f compose.yaml -f /tmp/dorka-self-e2e.override.yaml up -d --build
export DORKA_SERVER_CONTAINER="$(docker compose -f compose.yaml -f /tmp/dorka-self-e2e.override.yaml ps -q dorka-server)"
test -n "$DORKA_SERVER_CONTAINER"
for _ in $(seq 1 180); do
  test "$(docker inspect "$DORKA_SERVER_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || true)" = healthy && break
  sleep 1
done
test "$(docker inspect "$DORKA_SERVER_CONTAINER" --format '{{.State.Health.Status}}')" = healthy
```

Use `$DORKA_SERVER_CONTAINER` below.

Wait for `Main`:

```bash
for _ in $(seq 1 300); do
  test "$(docker inspect dorka-computer-main --format '{{.State.Health.Status}}' 2>/dev/null || true)" = healthy && break
  sleep 1
done
test "$(docker inspect dorka-computer-main --format '{{.State.Health.Status}}')" = healthy
test -z "$(docker port dorka-computer-main)"
export DORKA_MAIN_ID="$(docker inspect dorka-computer-main --format '{{.Id}}')"
printf 'server_container=%s\nmain_container=%s\n' \
  "$DORKA_SERVER_CONTAINER" "$DORKA_MAIN_ID" >>"$DORKA_E2E_ARTIFACTS/run.txt"
```

Expected: both health checks are `healthy`; the port check is empty.

## 5. Open the private tunnel and obtain the pairing URL

On the **macOS client**, keep this command running in its own terminal:

```bash
ssh -N -L 127.0.0.1:16768:127.0.0.1:16768 <linux-host>
```

Expected: the command remains in the foreground without an error. In a second macOS terminal:

```bash
nc -z 127.0.0.1 16768
```

Expected: exit 0.

On the **Linux host**, view—but do not save—the readiness line:

```bash
docker logs "$DORKA_SERVER_CONTAINER" 2>&1 \
  | grep '"type":"dorka_server_ready"' \
  | tail -1
```

Copy the `pairing.url` value directly into Dorka. Do not copy the line into retained evidence. The URL should advertise `127.0.0.1:16768`; **stop** if it advertises the container address or any public address.

## 6. Pair the macOS client

On the **macOS Dorka app**:

1. Open **Settings → Remote Dorka Servers**.
2. Click **Add Server**.
3. Name it `Disposable native E2E`.
4. Paste the pairing URL.
5. Click **Add Server**, then **Connect** if needed.
6. Set it as the active Server for this test.

Expected within 60 seconds:

- the server row says **Connected**;
- **Main** appears as one running Computer;
- the default Agent appears;
- no raw pairing URL remains visible in any screenshot you retain.

**Stop** if the client reports an incompatible protocol, authentication failure, or remains disconnected. Confirm the SSH tunnel first; generate a fresh topology rather than editing a pairing credential.

## 7. Run the macOS/client test matrix

Use the exact token `run-dna-self-e2e-a`; the repository fixture recognizes only `run-dna-*` tokens.

### A. Launch and terminal authority

1. On macOS, select the default Agent and `Main`.
2. Launch a Run with prompt: `run-dna-self-e2e-a`.
3. Open the Run's terminal/output.

Expected:

```text
DORKA_NATIVE_AGENT_READY run-dna-self-e2e-a
```

The Run remains running. On the Linux host, verify the Computer still publishes no host ports:

```bash
test -z "$(docker port dorka-computer-main)"
```

### B. Client disconnect survival

1. Quit the macOS Dorka client. Leave the SSH tunnel running.
2. Wait 10 seconds.
3. Reopen Dorka and reconnect to `Disposable native E2E`.

Expected: the same Run is still running and its terminal still contains the readiness marker. Client loss did not complete or relaunch it.

### C. Server replacement survival

On the Linux host:

```bash
export DORKA_SERVER_BEFORE="$(docker inspect "$DORKA_SERVER_CONTAINER" --format '{{.Id}}')"
docker compose -f compose.yaml -f /tmp/dorka-self-e2e.override.yaml up -d --force-recreate dorka-server
export DORKA_SERVER_CONTAINER="$(docker compose -f compose.yaml -f /tmp/dorka-self-e2e.override.yaml ps -q dorka-server)"
for _ in $(seq 1 180); do
  test "$(docker inspect "$DORKA_SERVER_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || true)" = healthy && break
  sleep 1
done
test "$(docker inspect "$DORKA_SERVER_CONTAINER" --format '{{.State.Health.Status}}')" = healthy
test "$(docker inspect "$DORKA_SERVER_CONTAINER" --format '{{.Id}}')" != "$DORKA_SERVER_BEFORE"
test "$(docker inspect dorka-computer-main --format '{{.Id}}')" = "$DORKA_MAIN_ID"
```

Expected on macOS within 60 seconds:

- the Server reconnects;
- `Main` is the same Computer;
- the existing Run remains present and running;
- the readiness marker appears once for that Run; there is no duplicate Run.

### D. Exact completion evidence

On the Linux host:

```bash
docker exec dorka-computer-main \
  touch /workspace/run-dna-self-e2e-a.exit
```

Expected on macOS within 60 seconds:

```text
DORKA_NATIVE_AGENT_EXIT run-dna-self-e2e-a
```

The Run leaves `running` and settles to `waiting` without changing its terminal identity. A transient disconnect alone must not produce this transition.

### Matrix verdict

| Case                        | Required result                                      |
| --------------------------- | ---------------------------------------------------- |
| Pair through private tunnel | Connected within 60 s                                |
| First-run provisioning      | Exactly one running `Main`                           |
| Private Computer ports      | `docker port dorka-computer-main` is empty           |
| Fixture launch              | One Run; exact READY marker                          |
| Client restart              | Same Run remains running                             |
| Server replacement          | Server ID changes; Computer ID does not; no relaunch |
| Exact exit                  | Exact EXIT marker; Run leaves running                |
| Native gate                 | Every case passed; no cleanup residue                |

Do not mark the run passed if any row is unobserved.

## 8. Retain bounded evidence

On the Linux host, capture only non-secret summaries:

```bash
{
  printf 'commit=%s\n' "$DORKA_E2E_SHA"
  uname -srvm
  $DORKA_ENGINE version --format '{{.Client.Version}}'
  printf 'server_image=%s\n' "$($DORKA_ENGINE image inspect dorka-server:local --format '{{.Id}}')"
  printf 'computer_image=%s\n' "$($DORKA_ENGINE image inspect dorka-computer:self-e2e --format '{{.Id}}')"
  printf 'computer_ports=%q\n' "$(docker port dorka-computer-main)"
} >"$DORKA_E2E_ARTIFACTS/manual-summary.txt"

docker compose -f compose.yaml -f /tmp/dorka-self-e2e.override.yaml ps \
  >"$DORKA_E2E_ARTIFACTS/compose-ps.txt"
chmod -R go-rwx "$DORKA_E2E_ARTIFACTS"
```

Also retain:

- `native-acceptance/summary.json`, `cleanup.json`, `exit-code`, and the harness's redacted diagnostics;
- one macOS screenshot after connection showing Server/Computer/Run state, with no pairing URL, token, account name, or unrelated workspace;
- a short handwritten verdict for each matrix row.

Do **not** retain raw `docker logs`, the readiness JSON, pairing URLs, desktop passwords, private keys, full container inspection, or unredacted service logs.

## 9. Exact cleanup

### macOS first

1. In **Settings → Remote Dorka Servers**, remove `Disposable native E2E`.
2. Quit the disposable Dorka client/profile.
3. Stop the SSH tunnel with `Ctrl-C`.
4. Confirm the local listener is gone:

```bash
! nc -z 127.0.0.1 16768
```

### Linux host

Run from the checkout:

```bash
set -euo pipefail

docker rm -f dorka-computer-main dorka-computer-secondary 2>/dev/null || true
for volume in \
  dorka-computer-main-home \
  dorka-computer-main-workspace \
  dorka-computer-main-ssh-host-keys \
  dorka-computer-secondary-home \
  dorka-computer-secondary-workspace \
  dorka-computer-secondary-ssh-host-keys; do
  docker volume rm -f "$volume" 2>/dev/null || true
done

docker compose -f compose.yaml -f /tmp/dorka-self-e2e.override.yaml \
  down --volumes --remove-orphans --rmi local

docker image rm -f dorka-computer:self-e2e dorka-computer:selkies 2>/dev/null || true
rm -f /tmp/dorka-self-e2e.override.yaml
```

Verify only the exact resources owned by this run:

```bash
residue="$({
  docker ps -aq --filter 'name=^dorka-computer-main$'
  docker ps -aq --filter 'name=^dorka-computer-secondary$'
  docker volume ls -q --filter 'name=^dorka-data$'
  docker volume ls -q --filter 'name=^dorka-computer-main-'
  docker volume ls -q --filter 'name=^dorka-computer-secondary-'
  docker network ls -q --filter 'name=^dorka-control$'
  docker network ls -q --filter 'name=^dorka-runtimes$'
} | sed '/^$/d')"
printf '%s' "$residue"
test -z "$residue"
```

Expected: no output and exit 0. If residue remains, record its exact ID/name in the verdict, remove only that named resource, and rerun the check. Never use global prune commands on a shared engine.

Keep `$DORKA_E2E_ARTIFACTS` only as long as required by the review. Removing that directory later is an evidence-retention decision, not engine cleanup.

## Supported repository surfaces used

- `pnpm test:e2e:dorka-native-linux:contracts`
- `pnpm test:e2e:dorka-native-linux`
- `config/scripts/run-dorka-native-linux-acceptance.ts`
- `tests/e2e/fixtures/dorka-native-linux-computer/Dockerfile`
- `tests/e2e/fixtures/dorka-native-linux-computer/agent-shim.sh`
- `Dockerfile`
- `docker/computer/Dockerfile`
- `compose.yaml`
- `docs/reference/container-deployment.md`
- `docs/site/content/docs/remote-servers.mdx`
