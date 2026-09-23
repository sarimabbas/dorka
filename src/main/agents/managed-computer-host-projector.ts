import { posix } from 'node:path'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type { SshTarget } from '../../shared/ssh-types'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { SshGitProvider } from '../providers/ssh-git-provider'
import type { ManagedSshHostSessions } from '../ssh/managed-ssh-host-sessions'

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

export type ManagedComputerConnection = {
  connectionId: string
  executionHostId: `ssh:${string}`
  git: ManagedComputerGitCapability | undefined
}

export type ManagedComputerHostProjector = {
  connect(computerId: string): Promise<ManagedComputerConnection>
}

export function createManagedComputerHostProjector(options: {
  computers: Pick<ComputerRuntimeManager, 'resolveSshIdentityFile'>
  sessions: Pick<ManagedSshHostSessions, 'connect'>
}): ManagedComputerHostProjector {
  return {
    async connect(computerId) {
      const identityFile = await options.computers.resolveSshIdentityFile(computerId)
      const target = managedComputerSshTarget(computerId, identityFile)
      await options.sessions.connect(target)
      return {
        connectionId: target.id,
        executionHostId: toSshExecutionHostId(target.id),
        git: getSshGitProvider(target.id)
      }
    }
  }
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
