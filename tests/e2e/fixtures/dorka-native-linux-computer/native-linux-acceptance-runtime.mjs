import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir, totalmem } from 'node:os'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  acceptanceEngineFacts,
  acceptanceNames,
  assertUnverifiable,
  redactArtifact
} from '../../../../config/scripts/run-dorka-native-linux-acceptance.ts'
const MAIN = 'dorka-computer-main'
const FIXED_VOLUMES = [`${MAIN}-home`, `${MAIN}-workspace`, `${MAIN}-ssh-host-keys`]
const PENDING = '/home/ubuntu/.dorka/managed-pty-exits/v1/pending'
const ACKED = '/home/ubuntu/.dorka/managed-pty-exits/v1/acknowledged'
const ROOT = resolve(import.meta.dirname, '../../../..')
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input: options.input,
    env: { ...process.env, ...options.env },
    maxBuffer: 8 * 1024 * 1024
  })
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      redactArtifact(
        `${program} ${args.join(' ')} failed (${result.status}): ${result.stderr.trim()}`
      )
    )
  }
  return result.stdout.trim()
}
function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
function engine(args, options) {
  return command(process.env.DORKA_ENGINE ?? 'podman', args, options)
}
function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = probe()
    if (result !== void 0) {
      return result
    }
    sleep(1e3)
  }
  throw new Error(`timed out waiting for ${label}`)
}
function artifact(root, name, value) {
  const text =
    typeof value === 'string'
      ? value
      : `${JSON.stringify(value, null, 2)}
`
  writeFileSync(resolve(root, name), redactArtifact(text), { mode: 384 })
}
function preflight(names) {
  requireValue(process.platform === 'linux' && process.arch === 'x64', 'requires native Linux x64')
  requireValue(process.versions.node.split('.')[0] === '24', 'requires Node 24')
  requireValue(
    availableParallelism() >= 4 && totalmem() >= 16 * 1024 ** 3,
    'requires 4 CPUs and 16 GiB RAM'
  )
  requireValue(process.getuid?.() !== 0, 'requires an unprivileged acceptance user')
  const socket = process.env.DOCKER_HOST?.replace(/^unix:\/\//, '')
  requireValue(socket, 'DOCKER_HOST must name the disposable engine socket')
  const info = JSON.parse(engine(['info', '--format', 'json']))
  const facts = acceptanceEngineFacts(info)
  requireValue(facts.os === 'linux' && facts.arch === 'amd64', 'engine must be native linux/amd64')
  if (!facts.rootless) {
    requireValue(
      process.env.DORKA_ACCEPTANCE_ALLOW_ROOTFUL === '1',
      'engine must be rootless unless an isolated rootful engine is explicitly allowed'
    )
    requireValue(engine(['ps', '-aq']) === '', 'rootful acceptance engine is not disposable')
    requireValue(engine(['volume', 'ls', '-q']) === '', 'rootful acceptance engine has volumes')
    const customNetworks = engine(['network', 'ls', '--format', '{{.Name}}'])
      .split('\n')
      .filter((name) => name && !['bridge', 'host', 'none'].includes(name))
    requireValue(customNetworks.length === 0, 'rootful acceptance engine has custom networks')
  }
  requireValue(
    Number(
      command('df', ['-Pk', facts.storeRoot ?? '.'])
        .split(/\s+/)
        .at(-3)
    ) >= 62914560,
    'requires 60 GiB free in the container image store'
  )
  requireValue(engine(['ps', '-aq', '--filter', `name=^${MAIN}$`]) === '', `${MAIN} already exists`)
  requireValue(
    engine(['volume', 'ls', '-q', '--filter', `name=^${MAIN}-`]) === '',
    'fixed volumes already exist'
  )
  requireValue(
    engine(['network', 'ls', '-q', '--filter', 'name=^dorka-runtimes$']) === '',
    'dorka-runtimes already exists'
  )
  command('git', ['diff', '--quiet'])
  command('git', ['diff', '--cached', '--quiet'])
  const expected = process.env.DORKA_ACCEPTANCE_SHA
  if (expected) {
    requireValue(
      command('git', ['rev-parse', 'HEAD']) === expected,
      'checkout does not match DORKA_ACCEPTANCE_SHA'
    )
  }
  requireValue(names.run.length <= 80, 'acceptance resource token is unexpectedly long')
  return facts
}
function cleanup(names, artifacts) {
  const failures = []
  const attempt = (args) => {
    const result = spawnSync(process.env.DORKA_ENGINE ?? 'podman', args, { encoding: 'utf8' })
    if (result.status !== 0 && !/no such|not found|does not exist/i.test(result.stderr)) {
      failures.push(`${args[0]} ${args[1] ?? ''}`)
    }
  }
  attempt(['rm', '-f', names.server, MAIN])
  for (const id of engine(['ps', '-aq', '--filter', `label=${names.label}`])
    .split('\n')
    .filter(Boolean)) {
    attempt(['rm', '-f', id])
  }
  for (const volume of [names.serverData, ...FIXED_VOLUMES]) {
    attempt(['volume', 'rm', '-f', volume])
  }
  for (const id of engine(['volume', 'ls', '-q', '--filter', `label=${names.label}`])
    .split('\n')
    .filter(Boolean)) {
    attempt(['volume', 'rm', '-f', id])
  }
  for (const network of ['dorka-runtimes', names.controlNetwork]) {
    attempt(['network', 'rm', network])
  }
  attempt(['image', 'rm', '-f', names.computerImage, names.computerBaseImage, names.serverImage])
  const residue = [
    engine(['ps', '-aq', '--filter', `name=^${MAIN}$`]),
    engine(['ps', '-aq', '--filter', `label=${names.label}`]),
    engine(['volume', 'ls', '-q', '--filter', `name=^${MAIN}-`]),
    engine(['volume', 'ls', '-q', '--filter', `label=${names.label}`]),
    engine(['network', 'ls', '-q', '--filter', 'name=^dorka-runtimes$'])
  ].filter(Boolean)
  artifact(artifacts, 'cleanup.json', { attempted: true, failures, residue })
  return [...failures, ...residue]
}
function build(names, artifacts) {
  const build2 = (tag, file, extra = []) => {
    const output = engine([
      'build',
      '--pull',
      '--platform',
      'linux/amd64',
      '--label',
      names.label,
      ...extra,
      '-f',
      file,
      '-t',
      tag,
      '.'
    ])
    appendFileSync(resolve(artifacts, 'build.log'), redactArtifact(output))
    requireValue(
      engine(['image', 'inspect', tag, '--format', '{{.Os}}/{{.Architecture}}']) === 'linux/amd64',
      `${tag} is not linux/amd64`
    )
  }
  build2(names.computerBaseImage, 'docker/computer/Dockerfile')
  build2(names.computerImage, 'tests/e2e/fixtures/dorka-native-linux-computer/Dockerfile', [
    '--build-arg',
    `BASE_IMAGE=${names.computerBaseImage}`
  ])
  build2(names.serverImage, 'Dockerfile')
  artifact(
    artifacts,
    'image-ids.txt',
    [names.serverImage, names.computerImage]
      .map((image) => engine(['image', 'inspect', image, '--format', '{{.Id}}']))
      .join('\n')
  )
}
function rpc(pairing, method, params = void 0) {
  const source = `import {RuntimeClient} from './out/cli/runtime/client.js';const c=new RuntimeClient(undefined,30000,process.env.DORKA_PAIRING_CODE);const r=await c.call(process.argv[1],JSON.parse(process.argv[2]));process.stdout.write(JSON.stringify(r.result));`
  return JSON.parse(
    command('node', ['--input-type=module', '-e', source, method, JSON.stringify(params)], {
      env: { DORKA_PAIRING_CODE: pairing }
    }).trim()
  )
}
function startServer(names, port, image) {
  const socket = process.env.DOCKER_HOST?.replace(/^unix:\/\//, '') ?? ''
  engine([
    'create',
    '--name',
    names.server,
    '--label',
    names.label,
    '--init',
    '--network',
    names.controlNetwork,
    '-p',
    `127.0.0.1:${port}:6768`,
    '-e',
    'DOCKER_HOST=unix:///var/run/docker.sock',
    '-e',
    `DORKA_COMPUTER_IMAGE=${image}`,
    '-e',
    'DORKA_DEFAULT_HARNESS=pi',
    '-e',
    'DORKA_DEFAULT_AGENT_PROMPT=Dorka native Linux acceptance agent.',
    '-v',
    `${names.serverData}:/data`,
    '-v',
    `${socket}:/var/run/docker.sock`,
    names.serverImage,
    '--json',
    '--bind',
    '0.0.0.0',
    '--port',
    '6768',
    '--pairing-address',
    `127.0.0.1:${port}`
  ])
  engine(['network', 'connect', 'dorka-runtimes', names.server])
  engine(['start', names.server])
}
function ready(names, artifacts, suffix) {
  const value = waitFor('dorkad readiness', 18e4, () => {
    const logs = engine(['logs', names.server], { allowFailure: true })
    const line = logs.split('\n').findLast((item) => item.includes('"type":"dorka_server_ready"'))
    return line ? JSON.parse(line.slice(line.indexOf('{'))) : void 0
  })
  requireValue(
    value.health?.platform === 'linux' && value.health?.arch === 'x64',
    'bad dorkad platform'
  )
  requireValue(
    value.health?.terminalDaemon?.state === 'live' &&
      value.health?.terminalDaemon?.selfTest?.ok === true,
    'terminal daemon is not ready'
  )
  requireValue(typeof value.pairing?.url === 'string', 'pairing URL missing')
  artifact(artifacts, `ready-${suffix}.json`, value)
  return { pairing: value.pairing.url, ready: value }
}
function findRun(pairing, agentId, id) {
  const runs = rpc(pairing, 'agents.runs.list', { agentId })
  requireValue(Array.isArray(runs), 'run list is not an array')
  const run = runs.find((candidate) => candidate.id === id)
  requireValue(run, `run ${id} missing`)
  return run
}
function launch(pairing, agentId, token) {
  const run = rpc(pairing, 'agents.run', { agentId, computerId: 'main', prompt: token })
  requireValue(typeof run === 'object' && run !== null && 'id' in run, 'agents.run returned no Run')
  return run
}
function runAcceptance() {
  const names = acceptanceNames()
  const artifacts = process.env.DORKA_ACCEPTANCE_ARTIFACTS ?? resolve(tmpdir(), names.run)
  mkdirSync(artifacts, { recursive: true, mode: 448 })
  chmodSync(artifacts, 448)
  const cases = []
  const record = (id, started) =>
    cases.push({ id, status: 'passed', durationMs: Date.now() - started })
  let failure
  let imageIds = {}
  let engineFacts
  try {
    engineFacts = preflight(names)
    const built = Date.now()
    build(names, artifacts)
    imageIds = {
      server: engine(['image', 'inspect', names.serverImage, '--format', '{{.Id}}']),
      computer: engine(['image', 'inspect', names.computerImage, '--format', '{{.Id}}'])
    }
    record('native-builds', built)
    engine(['network', 'create', '--label', names.label, 'dorka-runtimes'])
    engine(['network', 'create', '--label', names.label, names.controlNetwork])
    engine(['volume', 'create', '--label', names.label, names.serverData])
    const port = Number(
      process.env.DORKA_ACCEPTANCE_PORT ??
        command('node', [
          '-e',
          "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
        ])
    )
    const missing = Date.now()
    startServer(names, port, `local.invalid/${names.run}:never`)
    const degraded = ready(names, artifacts, 'missing-image')
    const degradedComputers = rpc(degraded.pairing, 'computers.list', {})
    requireValue(
      Array.isArray(degradedComputers) && degradedComputers.length === 0,
      'missing image provisioned a Computer'
    )
    engine(['rm', '-f', names.server])
    startServer(names, port, names.computerImage)
    let current = ready(names, artifacts, 'first-run')
    record('missing-image-recovery', missing)
    const first = Date.now()
    const computers = rpc(current.pairing, 'computers.list', {})
    const agents = rpc(current.pairing, 'agents.list', {})
    requireValue(
      Array.isArray(computers) && computers.length === 1 && computers[0].id === 'main',
      'expected exactly one Main'
    )
    requireValue(
      Array.isArray(agents) && agents.length === 1 && agents[0].harnessId === 'pi',
      'expected exactly one Assistant'
    )
    waitFor('Computer health', 3e5, () =>
      engine(['inspect', MAIN, '--format', '{{.State.Health.Status}}'], { allowFailure: true }) ===
      'healthy'
        ? true
        : void 0
    )
    requireValue(engine(['port', MAIN]) === '', 'Computer publishes host ports')
    engine([
      'exec',
      MAIN,
      'bash',
      '-lc',
      'exec 3<>/dev/tcp/127.0.0.1/2222 && exec 4<>/dev/tcp/127.0.0.1/8080'
    ])
    engine([
      'exec',
      names.server,
      'bash',
      '-lc',
      'exec 3<>/dev/tcp/dorka-computer-main/2222 && curl -kfsS https://dorka-computer-main:8080/ >/tmp/selkies.html'
    ])
    engine(['exec', MAIN, 'curl', '-fsS', 'https://registry.npmjs.org/-/ping'])
    const fingerprint = engine([
      'exec',
      MAIN,
      'ssh-keygen',
      '-lf',
      '/etc/ssh/ssh_host_ed25519_key.pub',
      '-E',
      'sha256'
    ])
    engine(['restart', MAIN])
    waitFor('Computer health after restart', 3e5, () =>
      engine(['inspect', MAIN, '--format', '{{.State.Health.Status}}'], { allowFailure: true }) ===
      'healthy'
        ? true
        : void 0
    )
    requireValue(
      engine([
        'exec',
        MAIN,
        'ssh-keygen',
        '-lf',
        '/etc/ssh/ssh_host_ed25519_key.pub',
        '-E',
        'sha256'
      ]) === fingerprint,
      'Computer SSH host key changed across restart'
    )
    const supervisor = engine(['exec', MAIN, 'supervisorctl', 'status'])
    requireValue(!/FATAL|BACKOFF|EXITED/.test(supervisor), 'Selkies supervisor is degraded')
    artifact(artifacts, 'selkies-supervisor.txt', supervisor)
    artifact(artifacts, 'computer-processes.txt', engine(['exec', MAIN, 'ps', '-ef']))
    artifact(artifacts, 'computer-inspect.json', engine(['inspect', MAIN]))
    record('selkies-ssh-private-ports', first)
    const agentId = agents[0].id
    const generation = engine([
      'inspect',
      MAIN,
      '--format',
      '{{index .Config.Labels "dev.dorka.execution-generation"}}'
    ])
    const token = `run-${names.run}-a`
    const launched = launch(current.pairing, agentId, token)
    requireValue(
      launched.status === 'running' && launched.computerExecutionGeneration === generation,
      'managed Run identity is incomplete'
    )
    waitFor('agent marker', 6e4, () =>
      command(
        'node',
        [
          'out/cli/index.js',
          '--pairing-code',
          current.pairing,
          'terminal',
          'read',
          '--terminal',
          launched.terminalSessionId ?? '',
          '--limit',
          '200',
          '--json'
        ],
        { allowFailure: true }
      ).includes('DORKA_NATIVE_AGENT_READY')
        ? true
        : void 0
    )
    const mainId = engine(['inspect', MAIN, '--format', '{{.Id}}'])
    engine(['rm', '-f', names.server])
    startServer(names, port, names.computerImage)
    current = ready(names, artifacts, 'live-replacement')
    requireValue(
      engine(['inspect', MAIN, '--format', '{{.Id}}']) === mainId &&
        findRun(current.pairing, agentId, launched.id).status === 'running',
      'live replacement relaunched work'
    )
    engine(['network', 'disconnect', 'dorka-runtimes', MAIN])
    sleep(8e3)
    const disconnected = findRun(current.pairing, agentId, launched.id)
    assertUnverifiable(launched, disconnected)
    engine(['network', 'connect', 'dorka-runtimes', MAIN])
    record('live-replacement-and-disconnect', first)
    const offline = Date.now()
    engine(['stop', '--time', '20', names.server])
    engine(['exec', MAIN, 'touch', `/workspace/${token}.exit`])
    waitFor('pending certificate', 3e4, () =>
      Number(
        engine([
          'exec',
          MAIN,
          'bash',
          '-lc',
          `find '${PENDING}' -maxdepth 1 -name '*.json' | wc -l`
        ])
      ) === 1
        ? true
        : void 0
    )
    engine(['rm', names.server])
    startServer(names, port, names.computerImage)
    current = ready(names, artifacts, 'offline-replay')
    const projected = waitFor('Run exit projection', 3e4, () => {
      const run = findRun(current.pairing, agentId, launched.id)
      return run.status === 'waiting' ? run : void 0
    })
    requireValue(
      projected.terminalSessionId === launched.terminalSessionId &&
        projected.processIdentity === launched.processIdentity &&
        projected.computerExecutionGeneration === launched.computerExecutionGeneration &&
        projected.result === void 0 &&
        projected.error === void 0 &&
        projected.finishedAt === void 0,
      'exit projection changed immutable Run identity'
    )
    requireValue(
      Number(
        engine(['exec', MAIN, 'bash', '-lc', `find '${ACKED}' -maxdepth 1 -name '*.json' | wc -l`])
      ) === 1,
      'certificate was not acknowledged'
    )
    record('offline-exit-replay', offline)
    const blocked = Date.now()
    const token2 = `run-${names.run}-b`
    const run2 = launch(current.pairing, agentId, token2)
    engine(['stop', '--time', '20', names.server])
    engine(['exec', MAIN, 'touch', `/workspace/${token2}.exit`])
    waitFor('second pending certificate', 3e4, () =>
      Number(
        engine([
          'exec',
          MAIN,
          'bash',
          '-lc',
          `find '${PENDING}' -maxdepth 1 -name '*.json' | wc -l`
        ])
      ) === 1
        ? true
        : void 0
    )
    engine(['exec', '-u', '0', MAIN, 'chmod', '0500', ACKED])
    engine(['rm', names.server])
    startServer(names, port, names.computerImage)
    current = ready(names, artifacts, 'ack-blocked')
    waitFor('projection before acknowledgement', 3e4, () =>
      findRun(current.pairing, agentId, run2.id).status === 'waiting' ? true : void 0
    )
    requireValue(
      Number(
        engine([
          'exec',
          MAIN,
          'bash',
          '-lc',
          `find '${PENDING}' -maxdepth 1 -name '*.json' | wc -l`
        ])
      ) === 1,
      'blocked acknowledgement lost certificate'
    )
    engine(['exec', '-u', '0', MAIN, 'chmod', '0700', ACKED])
    engine(['rm', '-f', names.server])
    startServer(names, port, names.computerImage)
    current = ready(names, artifacts, 'ack-replay')
    waitFor('ack replay', 3e4, () =>
      Number(
        engine([
          'exec',
          MAIN,
          'bash',
          '-lc',
          `find '${PENDING}' -maxdepth 1 -name '*.json' | wc -l`
        ])
      ) === 0
        ? true
        : void 0
    )
    requireValue(
      Number(
        engine(['exec', MAIN, 'bash', '-lc', `find '${ACKED}' -maxdepth 1 -name '*.json' | wc -l`])
      ) === 2,
      'ack replay did not settle exactly one certificate per Run'
    )
    record('projection-before-ack-replay', blocked)
    artifact(artifacts, 'runs-final.json', rpc(current.pairing, 'agents.runs.list', { agentId }))
  } catch (error) {
    failure = error
  } finally {
    const residue = cleanup(names, artifacts)
    const summary = {
      schemaVersion: 1,
      commit: command('git', ['rev-parse', 'HEAD']),
      kernel: command('uname', ['-srvm']),
      engine: {
        kind: basename(process.env.DORKA_ENGINE ?? 'podman'),
        version: engine(['version', '--format', '{{.Client.Version}}'], { allowFailure: true }),
        rootless: engineFacts?.rootless ?? null
      },
      images: imageIds,
      cases,
      cleanup: { attempted: true, residue }
    }
    artifact(artifacts, 'summary.json', summary)
    if (residue.length > 0) {
      failure = new Error(`acceptance cleanup left residue: ${residue.join(', ')}`, {
        cause: failure
      })
    }
    writeFileSync(
      resolve(artifacts, 'exit-code'),
      `${failure ? 1 : 0}
`
    )
  }
  if (failure) {
    throw failure
  }
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  runAcceptance()
}
export { runAcceptance }
