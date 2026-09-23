import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createElectronHomeIsolation } from './electron-home-isolation'

const execFileAsync = promisify(execFile)
const RUNTIME_METADATA_FILE = 'dorka-runtime.json'
let dorkaDevUserDataPath: string | null = null
let dorkaServeProcess: ChildProcess | null = null
let dorkaServeStdout = ''
let dorkaServeStderr = ''

export type CliResult = {
  stdout: string
  stderr: string
}

type RunDorkaCliOptions = {
  retryMissingRuntimeMetadata?: boolean
}

export async function runDorkaCli(
  args: string[],
  options: RunDorkaCliOptions = {}
): Promise<CliResult> {
  try {
    return await runDorkaCliOnce(args)
  } catch (error) {
    if (
      options.retryMissingRuntimeMetadata !== false &&
      isMissingRuntimeMetadataError(args, error)
    ) {
      // Why: Windows CI can let the dev runtime exit while launching the
      // fixture app; reopen once so the desktop action gets a live runtime.
      await ensureDorkaRuntimeLaunched()
      return await runDorkaCliOnce(args)
    }
    throw error
  }
}

async function runDorkaCliOnce(args: string[]): Promise<CliResult> {
  const devCli = join(process.cwd(), 'config/scripts/dorka-dev.mjs')
  const command = process.env.DORKA_COMPUTER_CLI ?? process.execPath
  const cliArgs = process.env.DORKA_COMPUTER_CLI ? args : [devCli, ...args]
  const env = process.env.DORKA_COMPUTER_CLI
    ? { ...process.env }
    : await createComputerE2ERuntimeEnv()
  try {
    const result = await execFileAsync(command, cliArgs, {
      env,
      maxBuffer: 20 * 1024 * 1024
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
      const output = error as { message: string; stdout: string; stderr: string }
      throw new Error(`${output.message}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`)
    }
    throw error
  }
}

export async function ensureDorkaRuntimeLaunched(): Promise<void> {
  if (!process.env.DORKA_COMPUTER_CLI && process.platform === 'win32') {
    await ensureDorkaRuntimeServed()
    return
  }
  await runDorkaCli(['open', '--json'], { retryMissingRuntimeMetadata: false })
  await waitForDorkaRuntimeReady()
}

export async function stopDorkaRuntime(): Promise<void> {
  const processToStop = dorkaServeProcess
  if (!processToStop?.pid) {
    return
  }
  dorkaServeProcess = null
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(processToStop.pid), '/T', '/F'])
    } catch {
      // The foreground test runtime may already have exited.
    }
    return
  }
  processToStop.kill()
}

export function parseJsonOutput<T>(stdout: string): T {
  return JSON.parse(stdout) as T
}

async function getComputerE2eDorkaDevUserDataPath(): Promise<string> {
  if (!dorkaDevUserDataPath) {
    // Why: the shared dorka-dev profile can keep an older runtime alive across
    // local test runs, making computer-use E2E exercise stale provider code.
    dorkaDevUserDataPath = await mkdtemp(join(tmpdir(), 'dorka-computer-runtime-'))
  }
  return dorkaDevUserDataPath
}

async function waitForDorkaRuntimeReady(): Promise<void> {
  const userDataPath = await getComputerE2eDorkaDevUserDataPath()
  const metadataPath = join(userDataPath, RUNTIME_METADATA_FILE)
  const deadline = Date.now() + 15000
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      await access(metadataPath)
      const status = parseJsonOutput<{
        result: { runtime: { reachable: boolean } }
      }>((await runDorkaCli(['status', '--json'], { retryMissingRuntimeMetadata: false })).stdout)
      if (status.result.runtime.reachable) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }

  const detail = [
    lastError instanceof Error ? `Last error: ${lastError.message}` : null,
    dorkaServeStdout.trim() ? `serve stdout: ${dorkaServeStdout.trim()}` : null,
    dorkaServeStderr.trim() ? `serve stderr: ${dorkaServeStderr.trim()}` : null
  ]
    .filter(Boolean)
    .join(' ')
  throw new Error(`Dorka runtime metadata was not ready at ${metadataPath}.${detail}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureDorkaRuntimeServed(): Promise<void> {
  if (!dorkaServeProcess || dorkaServeProcess.exitCode !== null) {
    const devCli = join(process.cwd(), 'config/scripts/dorka-dev.mjs')
    const env = await createComputerE2ERuntimeEnv()
    dorkaServeStdout = ''
    dorkaServeStderr = ''
    dorkaServeProcess = spawn(process.execPath, [devCli, 'serve', '--no-pairing', '--json'], {
      env,
      windowsHide: true
    })
    dorkaServeProcess.stdout?.on('data', (chunk) => {
      dorkaServeStdout += String(chunk)
    })
    dorkaServeProcess.stderr?.on('data', (chunk) => {
      dorkaServeStderr += String(chunk)
    })
    dorkaServeProcess.once('exit', () => {
      dorkaServeProcess = null
    })
    process.once('exit', () => {
      dorkaServeProcess?.kill()
    })
  }
  await waitForDorkaRuntimeReady()
}

async function createComputerE2ERuntimeEnv(): Promise<NodeJS.ProcessEnv> {
  const userDataDir =
    process.env.DORKA_DEV_USER_DATA_PATH ?? (await getComputerE2eDorkaDevUserDataPath())
  // Why: agent runtimes export ELECTRON_RUN_AS_NODE, which would make the
  // spawned Electron behave as plain Node; strip it like every other caller.
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...inheritedEnv } = process.env
  void _electronRunAsNode
  const isolation = createElectronHomeIsolation({
    inheritedEnv,
    launchEnv: {},
    extraEnv: {},
    userDataDir
  })
  return {
    ...isolation.env,
    // Why: the Node CLI and the Electron child must resolve the same runtime
    // metadata while the E2E boundary owns their home and Codex paths.
    DORKA_DEV_USER_DATA_PATH: userDataDir
  }
}

function isMissingRuntimeMetadataError(args: string[], error: unknown): boolean {
  if (args[0] !== 'computer') {
    return false
  }
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return false
  }
  const message = String((error as { message?: unknown }).message)
  return (
    message.includes('"code": "runtime_unavailable"') &&
    message.includes('Could not read Dorka runtime metadata')
  )
}
