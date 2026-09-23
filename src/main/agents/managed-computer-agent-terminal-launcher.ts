import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type { SshTarget } from '../../shared/ssh-types'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import { deterministicAgentSessionUuid } from '../runtime/runtime-agent-launch-resolution'
import type { ManagedSshHostSessions } from '../ssh/managed-ssh-host-sessions'
import {
  AgentTerminalLaunchOutcomeUnknownError,
  type AgentTerminalIdentity,
  type AgentTerminalLaunch,
  type AgentTerminalLauncher
} from './agent-execution-service'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'

const COMPUTER_WORKSPACE = '/workspace'
type ManagedHarness = 'pi' | 'claude' | 'codex'

type ManagedComputerAgentTerminalLauncherOptions = {
  computers: Pick<ComputerRuntimeManager, 'resolveSshIdentityFile'>
  runtime: Pick<DorkaRuntimeService, 'createTerminalInWorkspaceScope'>
  sessions: Pick<ManagedSshHostSessions, 'connect'>
}

export function createManagedComputerAgentTerminalLauncher(
  options: ManagedComputerAgentTerminalLauncherOptions
): AgentTerminalLauncher {
  return async (launch) => launchManagedComputerAgentTerminal(options, launch)
}

async function launchManagedComputerAgentTerminal(
  options: ManagedComputerAgentTerminalLauncherOptions,
  launch: AgentTerminalLaunch
): Promise<AgentTerminalIdentity> {
  const harness = resolveHarness(launch.agent.harnessId)
  const cwd = resolveComputerCwd(launch.agent.workingDirectory)
  const identityFile = await options.computers.resolveSshIdentityFile(launch.computer.id)
  const target = computerSshTarget(launch.computer.id, identityFile)
  await options.sessions.connect(target)

  const operationId = createHash('sha256').update(launch.runId).digest('base64url')
  const handle = `term_${deterministicAgentSessionUuid(`${operationId}:handle`)}`
  let spawnCommitted = false
  let terminal: Awaited<
    ReturnType<
      ManagedComputerAgentTerminalLauncherOptions['runtime']['createTerminalInWorkspaceScope']
    >
  >
  try {
    terminal = await options.runtime.createTerminalInWorkspaceScope(
      {
        id: `computer-${launch.computer.id}`,
        path: COMPUTER_WORKSPACE,
        connectionId: target.id,
        repo: null,
        folderWorkspace: null
      },
      {
        startupAgent: harness,
        startupPrompt: [launch.agent.promptTemplate, launch.prompt].join('\n\n'),
        ...(launch.agent.model ? { launchPreferences: { model: launch.agent.model } } : {}),
        cwd,
        presentation: 'background',
        title: launch.agent.name,
        preAllocatedHandle: handle,
        agentSessionCreateOperationId: operationId,
        onPtySpawnCommitted: () => {
          spawnCommitted = true
        }
      }
    )
  } catch (error) {
    if (spawnCommitted) {
      throw new AgentTerminalLaunchOutcomeUnknownError()
    }
    throw error
  }

  const expectedHost = toSshExecutionHostId(target.id)
  if (
    terminal.executionHostId !== expectedHost ||
    !terminal.handle ||
    !terminal.ptyId ||
    !terminal.incarnationId
  ) {
    throw new AgentTerminalLaunchOutcomeUnknownError()
  }
  return {
    terminalSessionId: terminal.handle,
    processIdentity: `${terminal.ptyId}:${terminal.incarnationId}`
  }
}

function resolveHarness(value: string): ManagedHarness {
  if (value === 'pi' || value === 'claude' || value === 'codex') {
    return value
  }
  throw new Error(`Computer agent harness is unsupported: ${value}`)
}

export function resolveComputerCwd(value: string | undefined): string {
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

function computerSshTarget(computerId: string, identityFile: string): SshTarget {
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
