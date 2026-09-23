import { createHash } from 'node:crypto'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import { deterministicAgentSessionUuid } from '../runtime/runtime-agent-launch-resolution'
import {
  COMPUTER_WORKSPACE,
  type ManagedComputerHostProjector,
  resolveComputerSourceDirectory
} from './managed-computer-host-projector'
import {
  AgentTerminalLaunchOutcomeUnknownError,
  type AgentTerminalIdentity,
  type AgentTerminalLaunch,
  type AgentTerminalLauncher
} from './agent-execution-service'
type ManagedHarness = 'pi' | 'claude' | 'codex'

type ManagedComputerAgentTerminalLauncherOptions = {
  host: ManagedComputerHostProjector
  runtime: Pick<DorkaRuntimeService, 'createTerminalInWorkspaceScope'>
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
  const cwd = resolveComputerSourceDirectory(launch.agent.workingDirectory)
  const target = await options.host.connect(launch.computer.id)

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
        startupPrompt: launch.prompt,
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

export { resolveComputerSourceDirectory as resolveComputerCwd }
