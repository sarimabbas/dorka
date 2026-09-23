import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AgentRosterStore } from '../agents/agent-roster-store'
import {
  ComputerRuntimeManager,
  type ComputerCommandExecutor
} from '../computers/computer-runtime-manager'
import { runProcess } from '../../shared/child-process/run-process'
import type { ComputerCreateSpec, ComputerReconcileResult } from '../../shared/computer-runtime'

const SERVER_ID_FILE = 'server-id'
const DEFAULT_COMPUTER_IMAGE = 'dorka-computer:selkies'
const DEFAULT_ENGINE_PATH = 'docker'
const COMPUTER_MOUNT_ALLOWLIST_ENV = 'DORKA_COMPUTER_MOUNT_ALLOWLIST'

export type DorkadComputerEngineHealth =
  | {
      state: 'live'
      cliPath: string
      reconciliation: ComputerReconcileResult
    }
  | {
      state: 'degraded'
      cliPath: string
      reason: string
    }

export type DorkadControlPlaneHealth = {
  state: 'live' | 'degraded'
  serverId: string
  defaultComputerImage: string
  computerEngine: DorkadComputerEngineHealth
}

export type DorkadComputerCreate = Omit<ComputerCreateSpec, 'image'> & { image?: string }

export type DorkadControlPlaneService = {
  agents: AgentRosterStore
  computers: ComputerRuntimeManager
  health: DorkadControlPlaneHealth
  createComputer(spec: DorkadComputerCreate): ReturnType<ComputerRuntimeManager['create']>
}

type DorkadControlPlaneOptions = {
  dataDirectory: string
  env?: NodeJS.ProcessEnv
  execute?: ComputerCommandExecutor
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function loadOrCreateServerId(dataDirectory: string): Promise<string> {
  const path = join(dataDirectory, SERVER_ID_FILE)
  try {
    const serverId = (await readFile(path, 'utf8')).trim()
    if (!serverId) {
      throw new Error('Dorka server id is empty')
    }
    return serverId
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error
    }
  }

  await mkdir(dataDirectory, { recursive: true, mode: 0o700 })
  const serverId = randomUUID()
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${serverId}\n`, { mode: 0o600 })
  await rename(temporaryPath, path)
  return serverId
}

function engineFailureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseComputerMountAllowlist(value: string | undefined): string[] {
  if (!value) {
    return []
  }
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    throw new Error(`${COMPUTER_MOUNT_ALLOWLIST_ENV} must be a JSON array of absolute paths`)
  }
  return parsed
}

export async function createDorkadControlPlane(
  options: DorkadControlPlaneOptions
): Promise<DorkadControlPlaneService> {
  const env = options.env ?? process.env
  const execute = options.execute ?? runProcess
  const cliPath = env.DORKA_CONTAINER_ENGINE || DEFAULT_ENGINE_PATH
  const defaultComputerImage = env.DORKA_COMPUTER_IMAGE || DEFAULT_COMPUTER_IMAGE
  const serverId = await loadOrCreateServerId(options.dataDirectory)
  const agents = await AgentRosterStore.open(options.dataDirectory)
  const computers = new ComputerRuntimeManager({
    dataDirectory: options.dataDirectory,
    serverId,
    enginePath: cliPath,
    allowedMountSources: parseComputerMountAllowlist(env[COMPUTER_MOUNT_ALLOWLIST_ENV]),
    execute
  })

  let engineAvailable = false
  let computerEngine: DorkadComputerEngineHealth
  try {
    const probe = await execute({ program: cliPath, args: ['info'], timeoutMs: 5_000 })
    if (probe.code !== 0 || probe.timedOut) {
      const detail =
        probe.stderr.trim() ||
        (probe.timedOut ? 'probe timed out' : `exit code ${String(probe.code)}`)
      throw new Error(detail)
    }
    engineAvailable = true
    computerEngine = {
      state: 'live',
      cliPath,
      reconciliation: await computers.reconcile()
    }
  } catch (error) {
    computerEngine = { state: 'degraded', cliPath, reason: engineFailureReason(error) }
    console.error(
      `[dorkad] Computer ${engineAvailable ? 'reconciliation failed' : 'engine unavailable'}; Computer lifecycle is degraded: ${computerEngine.reason}`
    )
  }

  const health: DorkadControlPlaneHealth = {
    state: computerEngine.state,
    serverId,
    defaultComputerImage,
    computerEngine
  }
  return {
    agents,
    computers,
    health,
    createComputer: (spec) =>
      computers.create({ ...spec, image: spec.image ?? defaultComputerImage })
  }
}
