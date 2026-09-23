import { dirname, join, posix } from 'node:path'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type { SshTarget } from '../../shared/ssh-types'
import { isComputerExecutionGeneration } from '../../shared/computer-runtime'
import { writeSecureFile } from '../../shared/secure-file'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { IFilesystemProvider } from '../providers/types'
import type { SshGitProvider } from '../providers/ssh-git-provider'
import type { ManagedSshHostSessions } from '../ssh/managed-ssh-host-sessions'
import type { ManagedDurableExitEvidence } from '../ssh/managed-durable-exit-evidence'

export const COMPUTER_WORKSPACE = '/workspace'

export function resolveComputerSourceDirectory(value: string | undefined): string {
  if (value === undefined) {
    return COMPUTER_WORKSPACE
  }
  const normalized = posix.normalize(value)
  if (
    !posix.isAbsolute(value) ||
    value.includes('\0') ||
    value.includes('\\') ||
    value !== normalized
  ) {
    throw new Error('Computer agent working directory must be a normalized absolute POSIX path')
  }
  if (normalized !== COMPUTER_WORKSPACE && !normalized.startsWith(`${COMPUTER_WORKSPACE}/`)) {
    throw new Error('Computer agent working directory must be inside /workspace')
  }
  return normalized
}

export type ManagedComputerGitCapability = Pick<
  SshGitProvider,
  | 'getStatus'
  | 'getDiff'
  | 'getBranchCompare'
  | 'getBranchDiff'
  | 'isGitRepoAsync'
  | 'getComputerGitIdentity'
  | 'setComputerGitIdentity'
>

export type ManagedComputerSshBridgeDescriptor = {
  host: string
  port: number
  username: string
  identityFile: string
  expectedExecutionGeneration: string
  knownHostsFile: string
  knownHostsLine: string
}

export type ManagedComputerConnection = {
  connectionId: string
  executionHostId: `ssh:${string}`
  filesystem: IFilesystemProvider
  git: ManagedComputerGitCapability | undefined
  sshBridge?: ManagedComputerSshBridgeDescriptor
  durableExitEvidence?: ManagedDurableExitEvidence
}

export type ManagedComputerHostProjector = {
  connect(computerId: string): Promise<ManagedComputerConnection>
}

export function createManagedComputerHostProjector(options: {
  computers: Pick<ComputerRuntimeManager, 'getExecutionGeneration' | 'resolveSshIdentityFile'>
  sessions: Pick<ManagedSshHostSessions, 'connect' | 'readComputerSshBridgeEvidence'>
}): ManagedComputerHostProjector {
  return {
    async connect(computerId) {
      const [identityFile, expectedExecutionGeneration] = await Promise.all([
        options.computers.resolveSshIdentityFile(computerId),
        options.computers.getExecutionGeneration(computerId)
      ])
      const target = managedComputerSshTarget(computerId, identityFile)
      const session = await options.sessions.connect(target)
      const evidence = await options.sessions.readComputerSshBridgeEvidence(target.id)
      if (
        !isComputerExecutionGeneration(evidence.executionGeneration) ||
        evidence.executionGeneration !== expectedExecutionGeneration ||
        (await options.computers.getExecutionGeneration(computerId)) !== expectedExecutionGeneration
      ) {
        throw new Error('Managed Computer SSH bridge generation changed during connection.')
      }
      const sshBridge = createSshBridgeDescriptor(
        target,
        expectedExecutionGeneration,
        evidence.hostPublicKey
      )
      return {
        connectionId: target.id,
        executionHostId: toSshExecutionHostId(target.id),
        filesystem: requireSshFilesystemProvider(target.id),
        git: getSshGitProvider(target.id),
        sshBridge,
        ...(session.durableExitEvidence ? { durableExitEvidence: session.durableExitEvidence } : {})
      }
    }
  }
}

function createSshBridgeDescriptor(
  target: SshTarget,
  expectedExecutionGeneration: string,
  hostPublicKey: string
): ManagedComputerSshBridgeDescriptor {
  if (!target.identityFile) {
    throw new Error('Managed Computer SSH identity is unavailable.')
  }
  const key = validateEd25519PublicKey(hostPublicKey)
  const knownHostsLine = `[${target.host}]:${String(target.port)} ${key}`
  const knownHostsFile = join(
    dirname(target.identityFile),
    `known_hosts-${expectedExecutionGeneration}`
  )
  if (!writeSecureFile(knownHostsFile, `${knownHostsLine}\n`, { durable: true })) {
    throw new Error('Managed Computer SSH known_hosts file could not be secured.')
  }
  return {
    host: target.host,
    port: target.port,
    username: target.username,
    identityFile: target.identityFile,
    expectedExecutionGeneration,
    knownHostsFile,
    knownHostsLine
  }
}

function validateEd25519PublicKey(value: string): string {
  const match = /^ssh-ed25519 ([A-Za-z0-9+/]+={0,2})(?: [^\r\n]+)?$/.exec(value.trim())
  if (!match?.[1]) {
    throw new Error('Managed Computer SSH host public key is invalid.')
  }
  const encoded = match[1]
  const blob = Buffer.from(encoded, 'base64')
  if (
    blob.toString('base64') !== encoded ||
    blob.length !== 51 ||
    blob.readUInt32BE(0) !== 11 ||
    blob.subarray(4, 15).toString('ascii') !== 'ssh-ed25519' ||
    blob.readUInt32BE(15) !== 32
  ) {
    throw new Error('Managed Computer SSH host public key is invalid.')
  }
  return `ssh-ed25519 ${encoded}`
}

function managedComputerSshTarget(computerId: string, identityFile: string): SshTarget {
  return {
    id: `runtime-ssh-computer-${computerId}`,
    label: `Computer ${computerId}`,
    owner: { type: 'on-demand-runtime', runtimeId: `computer-${computerId}` },
    source: 'manual',
    host: `dorka-computer-${computerId}`,
    port: 2222,
    username: 'ubuntu',
    identityFile,
    identitiesOnly: true,
    relayGracePeriodSeconds: 0
  }
}
