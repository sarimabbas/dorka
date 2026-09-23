import { resolve } from 'node:path'
import { runAcceptance } from '../../tests/e2e/fixtures/dorka-native-linux-computer/native-linux-acceptance-runtime.mjs'
import {
  managedPtyExitCertificateId,
  type ManagedPtyExitCertificateV1
} from '../../src/shared/managed-pty-exit-evidence.ts'

const COMPUTERS = ['dorka-computer-main', 'dorka-computer-secondary']
const FIXED_VOLUMES = COMPUTERS.flatMap((computer) => [
  `${computer}-home`,
  `${computer}-workspace`,
  `${computer}-ssh-host-keys`
])

type Run = {
  id: string
  status: string
  terminalSessionId?: string
  processIdentity?: string
  computerExecutionGeneration?: string
  result?: string
  error?: string
  finishedAt?: number
}
type Names = ReturnType<typeof acceptanceNames>

type AcceptanceEngineCommand = (args: string[]) => {
  status: number | null
  stdout: string
  stderr: string
}

export type AcceptanceLock = { name: string; token: string }

const ACCEPTANCE_LOCK_VOLUME = 'dorka-native-linux-acceptance-lock'
const ACCEPTANCE_LOCK_LABEL = 'dev.dorka.acceptance-invocation'

type AcceptanceEngineInfo = {
  host?: { arch?: string; os?: string; security?: { rootless?: boolean } }
  store?: { graphRoot?: string }
  Architecture?: string
  OSType?: string
  SecurityOptions?: string[]
  DockerRootDir?: string
}

export function acceptanceEngineFacts(value: AcceptanceEngineInfo) {
  const podman = value.host
  const architecture = podman?.arch ?? value.Architecture
  return {
    arch: architecture === 'x86_64' ? 'amd64' : architecture,
    os: podman?.os ?? value.OSType,
    rootless:
      podman?.security?.rootless === true ||
      value.SecurityOptions?.some((option: string) => option.includes('rootless')) === true,
    storeRoot: podman ? value.store?.graphRoot : value.DockerRootDir
  }
}

export function acceptanceBuildArgs(options: {
  tag: string
  file: string
  label: string
  extra?: string[]
  pull?: boolean
}) {
  return [
    'build',
    ...(options.pull === false ? [] : ['--pull']),
    '--platform',
    'linux/amd64',
    '--label',
    options.label,
    ...(options.extra ?? []),
    '-f',
    options.file,
    '-t',
    options.tag,
    '.'
  ]
}

export function acceptanceNames(env = process.env, now = new Date(), pid = process.pid) {
  const raw = `dna-${env.GITHUB_RUN_ID ?? 'manual'}-${env.GITHUB_RUN_ATTEMPT ?? '1'}-${now.toISOString().replaceAll(/\D/g, '')}-${pid}`
  const run = raw
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.-]+/g, '-')
    .replaceAll(/-+$/g, '')
  return {
    run,
    label: `dev.dorka.acceptance-run=${run}`,
    server: `${run}-server`,
    serverImage: `${run}-server:local`,
    computerBaseImage: `${run}-computer-base:selkies`,
    computerImage: `${run}-computer-acceptance:selkies`,
    serverData: `${run}-server-data`,
    controlNetwork: `${run}-control`
  }
}

export function acquireAcceptanceLock(
  runEngine: AcceptanceEngineCommand,
  token: string
): AcceptanceLock {
  const created = runEngine([
    'volume',
    'create',
    '--label',
    `${ACCEPTANCE_LOCK_LABEL}=${token}`,
    ACCEPTANCE_LOCK_VOLUME
  ])
  if (created.status !== 0) {
    throw new Error(
      `acceptance lock acquisition failed: ${created.stderr.trim() || 'unknown error'}`
    )
  }
  const inspected = runEngine([
    'volume',
    'inspect',
    ACCEPTANCE_LOCK_VOLUME,
    '--format',
    `{{ index .Labels "${ACCEPTANCE_LOCK_LABEL}" }}`
  ])
  if (inspected.status !== 0 || inspected.stdout.trim() !== token) {
    throw new Error('acceptance lock is owned by another invocation')
  }
  return { name: ACCEPTANCE_LOCK_VOLUME, token }
}

export function releaseAcceptanceLock(
  runEngine: AcceptanceEngineCommand,
  lock: AcceptanceLock
): void {
  const inspected = runEngine([
    'volume',
    'inspect',
    lock.name,
    '--format',
    `{{ index .Labels "${ACCEPTANCE_LOCK_LABEL}" }}`
  ])
  if (inspected.status !== 0 || inspected.stdout.trim() !== lock.token) {
    return
  }
  const removed = runEngine(['volume', 'rm', lock.name])
  if (removed.status !== 0 && !/no such|not found|does not exist/i.test(removed.stderr)) {
    throw new Error(`acceptance lock release failed: ${removed.stderr.trim() || 'unknown error'}`)
  }
}

export function redactArtifact(value: string): string {
  return value
    .replaceAll(/dorka:\/\/pair\?[^\s"']+/g, '[REDACTED_PAIRING_URL]')
    .replaceAll(
      /("(?:deviceToken|privateKey|pairingCode|url)"\s*:\s*")[^"]+("?)/gi,
      '$1[REDACTED]$2'
    )
    .replaceAll(
      /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]'
    )
}

export function assertUnverifiable(before: Run, after: Run): void {
  for (const key of [
    'status',
    'terminalSessionId',
    'processIdentity',
    'computerExecutionGeneration'
  ] as const) {
    if (after[key] !== before[key]) {
      throw new Error(`unverifiable evidence changed ${key}`)
    }
  }
  for (const key of ['result', 'error', 'finishedAt'] as const) {
    if (after[key] !== before[key]) {
      throw new Error(`unverifiable evidence invented ${key}`)
    }
  }
}

export function certificateMatchesRun(certificate: ManagedPtyExitCertificateV1, run: Run): boolean {
  return (
    certificate.computerExecutionGeneration === run.computerExecutionGeneration &&
    run.processIdentity?.endsWith(`@@${certificate.relayPtyId}:${certificate.ptyIncarnationId}`) ===
      true &&
    certificate.certificateId === managedPtyExitCertificateId(certificate)
  )
}

export function cleanupResourceNames(names: Names): string[] {
  return [
    names.server,
    ...COMPUTERS,
    names.serverData,
    ...FIXED_VOLUMES,
    'dorka-runtimes',
    names.controlNetwork
  ]
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  runAcceptance()
}
