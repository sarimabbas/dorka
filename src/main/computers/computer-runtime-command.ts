import { posix } from 'node:path'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_COMPUTER_NETWORK,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL,
  type ComputerCreateSpec,
  type ComputerMountSpec
} from '../../shared/computer-runtime'

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const SERVER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const IMAGE_PATTERN =
  /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)*(?:[a-z0-9]+(?:[._-][a-z0-9]+)*)(?:(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})|(?:@sha256:[a-f0-9]{64}))?$/
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const SSH_PUBLIC_KEY_PATTERN = /^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [^\r\n]+)?$/

export const DORKA_SSH_PUBLIC_KEY_ENV = 'DORKA_SSH_PUBLIC_KEY'

const DEFAULT_CPUS = 2
const DEFAULT_MEMORY_MB = 4096
const DEFAULT_PIDS = 512
const MAX_ENVIRONMENT_ENTRIES = 128
const MAX_ENVIRONMENT_VALUE_LENGTH = 8192
const MAX_MOUNTS = 16
const FORBIDDEN_MOUNT_SOURCES = [
  '/',
  '/dev',
  '/home',
  '/proc',
  '/root',
  '/run',
  '/sys',
  '/Users',
  '/var/run'
]
const FORBIDDEN_MOUNT_TARGETS = [
  '/',
  '/home/dorka',
  '/home/ubuntu',
  '/etc/ssh',
  '/workspace',
  '/var/run/docker.sock',
  '/run/docker.sock'
]

type ValidatedComputerCreateSpec = Omit<Required<ComputerCreateSpec>, 'mounts'> & {
  mounts: Required<ComputerMountSpec>[]
}

export function validateComputerId(id: string): void {
  if (!ID_PATTERN.test(id)) {
    throw new Error('Computer id must be a lowercase DNS label of at most 63 characters')
  }
}

export function validateServerId(serverId: string): void {
  if (!SERVER_ID_PATTERN.test(serverId)) {
    throw new Error('Server id contains unsupported characters')
  }
}

export function validateComputerSpec(spec: ComputerCreateSpec): ValidatedComputerCreateSpec {
  validateComputerId(spec.id)
  if (!IMAGE_PATTERN.test(spec.image) || spec.image.length > 255) {
    throw new Error('Computer image is not a valid immutable command argument')
  }

  const resources = {
    cpus: spec.resources?.cpus ?? DEFAULT_CPUS,
    memoryMb: spec.resources?.memoryMb ?? DEFAULT_MEMORY_MB,
    pids: spec.resources?.pids ?? DEFAULT_PIDS
  }
  if (!Number.isFinite(resources.cpus) || resources.cpus < 0.25 || resources.cpus > 32) {
    throw new Error('Computer CPUs must be between 0.25 and 32')
  }
  if (
    !Number.isInteger(resources.memoryMb) ||
    resources.memoryMb < 256 ||
    resources.memoryMb > 131_072
  ) {
    throw new Error('Computer memory must be an integer between 256 and 131072 MiB')
  }
  if (!Number.isInteger(resources.pids) || resources.pids < 32 || resources.pids > 4096) {
    throw new Error('Computer PID limit must be an integer between 32 and 4096')
  }

  const environment = validateEnvironment(spec.environment ?? {})
  const mounts = spec.mounts?.map(validateMountSyntax) ?? []
  if (mounts.length > MAX_MOUNTS) {
    throw new Error(`Computer mounts may contain at most ${MAX_MOUNTS} entries`)
  }
  if (new Set(mounts.map((mount) => mount.target)).size !== mounts.length) {
    throw new Error('Computer mount targets must be unique')
  }
  return { id: spec.id, image: spec.image, resources, environment, mounts }
}

export function validateAllowedMountSources(sources: readonly string[]): string[] {
  const validated = sources.map((source) => validateMountPath(source, 'source'))
  if (new Set(validated).size !== validated.length) {
    throw new Error('Computer mount allowlist entries must be unique')
  }
  return validated
}

export function computerName(id: string): string {
  validateComputerId(id)
  return `dorka-computer-${id}`
}

export function createComputerArgs(
  spec: ComputerCreateSpec,
  serverId: string,
  sshPublicKey: string,
  allowedMountSources: readonly string[] = []
): string[] {
  validateServerId(serverId)
  if (!SSH_PUBLIC_KEY_PATTERN.test(sshPublicKey)) {
    throw new Error('Computer SSH public key is invalid')
  }
  const validated = validateComputerSpec(spec)
  const allowedSources = new Set(validateAllowedMountSources(allowedMountSources))
  for (const mount of validated.mounts) {
    if (!allowedSources.has(mount.source)) {
      throw new Error(`Computer mount source is not allowlisted: ${mount.source}`)
    }
  }

  const name = computerName(validated.id)
  const args = [
    'create',
    '--name',
    name,
    '--label',
    `${DORKA_MANAGED_LABEL}=true`,
    '--label',
    `${DORKA_SERVER_LABEL}=${serverId}`,
    '--label',
    `${DORKA_COMPUTER_LABEL}=${validated.id}`,
    '--network',
    DORKA_COMPUTER_NETWORK,
    '--cpus',
    String(validated.resources.cpus),
    '--memory',
    `${validated.resources.memoryMb}m`,
    '--pids-limit',
    String(validated.resources.pids),
    '--mount',
    `type=volume,source=${name}-home,target=/home/ubuntu`,
    '--mount',
    `type=volume,source=${name}-workspace,target=/workspace`,
    '--mount',
    `type=volume,source=${name}-ssh-host-keys,target=/etc/ssh`
  ]
  for (const key of Object.keys(validated.environment).sort()) {
    args.push('--env', `${key}=${validated.environment[key]}`)
  }
  for (const mount of validated.mounts) {
    args.push('--mount', mountArgument(mount))
  }
  args.push('--env', `${DORKA_SSH_PUBLIC_KEY_ENV}=${sshPublicKey}`)
  args.push('--workdir', '/workspace', validated.image)
  return args
}

export function listComputerIdsArgs(serverId: string): string[] {
  validateServerId(serverId)
  return [
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `label=${DORKA_MANAGED_LABEL}=true`,
    '--filter',
    `label=${DORKA_SERVER_LABEL}=${serverId}`
  ]
}

function validateEnvironment(environment: Record<string, string>): Record<string, string> {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error('Computer environment must be an object')
  }
  const entries = Object.entries(environment)
  if (entries.length > MAX_ENVIRONMENT_ENTRIES) {
    throw new Error(`Computer environment may contain at most ${MAX_ENVIRONMENT_ENTRIES} entries`)
  }
  for (const [name, value] of entries) {
    if (name === DORKA_SSH_PUBLIC_KEY_ENV) {
      throw new Error(`${DORKA_SSH_PUBLIC_KEY_ENV} is managed by Dorka`)
    }
    if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(`Computer environment variable name is invalid: ${name}`)
    }
    if (
      typeof value !== 'string' ||
      value.length > MAX_ENVIRONMENT_VALUE_LENGTH ||
      value.includes('\0')
    ) {
      throw new Error(`Computer environment variable value is invalid: ${name}`)
    }
  }
  return { ...environment }
}

function validateMountSyntax(mount: ComputerMountSpec): Required<ComputerMountSpec> {
  if (!mount || typeof mount !== 'object') {
    throw new Error('Computer mount must be an object')
  }
  if (mount.readOnly !== undefined && typeof mount.readOnly !== 'boolean') {
    throw new Error('Computer mount readOnly must be a boolean')
  }
  return {
    source: validateMountPath(mount.source, 'source'),
    target: validateMountPath(mount.target, 'target'),
    readOnly: mount.readOnly ?? true
  }
}

function validateMountPath(path: string, role: 'source' | 'target'): string {
  if (
    typeof path !== 'string' ||
    path.length > 1024 ||
    !path.startsWith('/') ||
    path !== posix.normalize(path) ||
    path.includes(',') ||
    path.includes('\0')
  ) {
    throw new Error(`Computer mount ${role} must be a normalized absolute POSIX path`)
  }
  if (
    role === 'source' &&
    FORBIDDEN_MOUNT_SOURCES.some((root) => path === root || path.startsWith(`${root}/`))
  ) {
    throw new Error(`Computer mount source is forbidden: ${path}`)
  }
  if (role === 'target' && FORBIDDEN_MOUNT_TARGETS.includes(path)) {
    throw new Error(`Computer mount target is forbidden: ${path}`)
  }
  return path
}

function mountArgument(mount: Required<ComputerMountSpec>): string {
  const readOnly = mount.readOnly ? ',readonly' : ''
  return `type=bind,source=${mount.source},target=${mount.target}${readOnly}`
}
