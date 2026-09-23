import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { quoteStartupArg } from '../../shared/tui-agent-startup-shell'
import { writeSecureFile } from '../../shared/secure-file'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import { deterministicAgentSessionUuid } from '../runtime/runtime-agent-launch-resolution'
import {
  DORKA_PI_COMPUTER_SSH_EXTENSION_FILE,
  getPiComputerSshExtensionSource
} from '../pi/computer-ssh-extension-source'
import type { ManagedComputerHostProjector } from './managed-computer-host-projector'
import {
  AgentTerminalLaunchOutcomeUnknownError,
  type AgentTerminalIdentity,
  type AgentTerminalLaunch,
  type AgentTerminalLauncher
} from './agent-execution-service'
type ManagedComputerAgentTerminalLauncherOptions = {
  host: ManagedComputerHostProjector
  privateDirectory: string
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
  requirePiHarness(launch.agent.harnessId)
  const extensionPath = join(options.privateDirectory, DORKA_PI_COMPUTER_SSH_EXTENSION_FILE)
  if (!writeSecureFile(extensionPath, getPiComputerSshExtensionSource(), { durable: true })) {
    throw new Error('Computer agent extension could not be secured')
  }
  const connection = await options.host.connect(launch.computer.id)
  const bridge = connection.sshBridge
  if (!bridge || bridge.expectedExecutionGeneration !== launch.computerExecutionGeneration) {
    throw new Error('Computer SSH bridge execution generation is unverifiable')
  }
  const scratchDirectory = join(options.privateDirectory, 'agent-runs', launch.runId, 'workspace')
  await mkdir(scratchDirectory, { recursive: true, mode: 0o700 })

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
        id: `computer-agent-${launch.runId}`,
        path: scratchDirectory,
        connectionId: null,
        repo: null,
        folderWorkspace: null
      },
      {
        startupAgent: 'pi',
        startupPrompt: launch.prompt,
        agentArgs: `--no-extensions --tools read,write,edit,bash --extension ${quoteStartupArg(extensionPath, 'posix')}`,
        ...(launch.agent.model ? { launchPreferences: { model: launch.agent.model } } : {}),
        cwd: scratchDirectory,
        env: {
          DORKA_COMPUTER_SSH_HOST: bridge.host,
          DORKA_COMPUTER_SSH_PORT: String(bridge.port),
          DORKA_COMPUTER_SSH_USER: bridge.username,
          DORKA_COMPUTER_SSH_IDENTITY_FILE: bridge.identityFile,
          DORKA_COMPUTER_SSH_KNOWN_HOSTS_FILE: bridge.knownHostsFile,
          DORKA_COMPUTER_EXECUTION_GENERATION: bridge.expectedExecutionGeneration,
          DORKA_COMPUTER_SOURCE_DIRECTORY: launch.sourceDirectory
        },
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

  if (
    terminal.executionHostId !== LOCAL_EXECUTION_HOST_ID ||
    !terminal.handle ||
    !terminal.ptyId ||
    !terminal.incarnationId
  ) {
    throw new AgentTerminalLaunchOutcomeUnknownError()
  }
  return {
    terminalSessionId: terminal.handle,
    processIdentity: `${terminal.ptyId}:${terminal.incarnationId}`,
    ptyId: terminal.ptyId
  }
}

function requirePiHarness(value: string): void {
  if (value !== 'pi') {
    throw new Error(`Computer agent harness is unsupported: ${value}`)
  }
}
