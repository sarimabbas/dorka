import {
  DORKA_COMPUTER_LABEL,
  DORKA_COMPUTER_NETWORK,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL,
  type ComputerCreateSpec
} from '../../shared/computer-runtime'

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const SERVER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const IMAGE_PATTERN =
  /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)*(?:[a-z0-9]+(?:[._-][a-z0-9]+)*)(?:(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})|(?:@sha256:[a-f0-9]{64}))?$/

const DEFAULT_CPUS = 2
const DEFAULT_MEMORY_MB = 4096
const DEFAULT_PIDS = 512

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

export function validateComputerSpec(spec: ComputerCreateSpec): Required<ComputerCreateSpec> {
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
  return { id: spec.id, image: spec.image, resources }
}

export function computerName(id: string): string {
  validateComputerId(id)
  return `dorka-computer-${id}`
}

export function createComputerArgs(spec: ComputerCreateSpec, serverId: string): string[] {
  validateServerId(serverId)
  const validated = validateComputerSpec(spec)
  const name = computerName(validated.id)
  const homeVolume = `${name}-home`
  const workspaceVolume = `${name}-workspace`

  return [
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
    `type=volume,source=${homeVolume},target=/home/dorka`,
    '--mount',
    `type=volume,source=${workspaceVolume},target=/workspace`,
    '--workdir',
    '/workspace',
    validated.image
  ]
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
