import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import type { RuntimeCapability } from '../../src/shared/protocol-version'
import {
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  AGENT_REFERENCES_RUNTIME_CAPABILITY,
  AGENT_ROSTER_RUNTIME_CAPABILITY,
  AGENT_RUN_HISTORY_RUNTIME_CAPABILITY,
  COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY,
  COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY
} from '../../src/shared/protocol-version'
import { expect, test } from './helpers/dorka-app'

const ARTIFACT_ROOT = process.platform === 'win32' ? tmpdir() : '/tmp'
const ARTIFACT_DIR = path.join(ARTIFACT_ROOT, `dorka-hidden-electron-qa-${process.pid}`)
const RPC_LOG_PATH = path.join(ARTIFACT_DIR, 'runtime-rpc.jsonl')
const COMPUTER = {
  id: 'qa-computer',
  name: 'QA Computer',
  image: 'localhost/dorka-computer:qa',
  state: 'running' as const
}
const AGENT = {
  id: 'qa-reviewer',
  name: 'Release reviewer',
  character: { color: 'violet', variant: 'orb' },
  job: 'Review changes before release',
  harnessId: 'claude',
  promptTemplate: 'Review the release candidate.',
  revision: 3,
  references: {
    version: 1 as const,
    items: [
      { kind: 'skill' as const, name: 'code-review', scope: 'either' as const },
      {
        kind: 'mcp-server' as const,
        name: 'linear',
        configId: 'workspace' as const
      }
    ]
  },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_100
}
const CAPABILITIES: RuntimeCapability[] = [
  AGENT_ROSTER_RUNTIME_CAPABILITY,
  AGENT_REFERENCES_RUNTIME_CAPABILITY,
  AGENT_RUN_HISTORY_RUNTIME_CAPABILITY,
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY,
  COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY,
  COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY
]

test.use({
  seedTestRepo: false,
  dorkaAppExtraEnv: { DORKA_BACKGROUND_LAUNCH: '1' }
})

async function installFailClosedRuntime(
  electronApp: ElectronApplication,
  userDataDir: string
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, fixture) => {
      const fs = process.getBuiltinModule('node:fs')
      let computerState: 'running' | 'stopped' = 'running'
      const status = {
        runtimeId: 'hidden-qa-runtime',
        rendererGraphEpoch: 1,
        graphStatus: 'ready' as const,
        authoritativeWindowId: null,
        liveTabCount: 0,
        liveLeafCount: 0,
        runtimeProtocolVersion: 1,
        minCompatibleRuntimeClientVersion: 1,
        capabilities: fixture.capabilities
      }
      const success = (result: unknown) => ({
        id: 'hidden-qa',
        ok: true as const,
        result,
        _meta: { runtimeId: status.runtimeId }
      })

      ipcMain.removeHandler('runtime:getStatus')
      ipcMain.handle('runtime:getStatus', () => status)
      ipcMain.removeHandler('runtime:call')
      ipcMain.handle('runtime:call', (_event, args: { method: string; params?: unknown }) => {
        fs.appendFileSync(
          fixture.rpcLogPath,
          `${JSON.stringify({ method: args.method, params: args.params ?? null })}\n`
        )
        switch (args.method) {
          case 'status.get':
            return success(status)
          case 'computers.list':
            return success([{ ...fixture.computer, state: computerState }])
          case 'computers.configuration.get':
            return success({
              id: fixture.computer.id,
              revision: 'qa-revision',
              desiredState: computerState,
              configuration: {
                resources: { cpus: 2, memoryMb: 4096, pids: 256 },
                environment: ['DORKA_QA_TOKEN'],
                premounts: []
              }
            })
          case 'computers.gitIdentity.get':
            return success({ name: 'QA Reviewer', email: 'qa@example.test' })
          case 'computers.stop':
            computerState = 'stopped'
            return success({ ...fixture.computer, state: computerState })
          case 'agents.list':
            return success([fixture.agent])
          case 'agents.runs.list':
            return success([])
          default:
            return {
              id: 'hidden-qa',
              ok: false as const,
              error: {
                code: 'hidden_qa_unexpected_rpc',
                message: `Hidden QA rejected unexpected Runtime RPC: ${args.method}`
              },
              _meta: { runtimeId: status.runtimeId }
            }
        }
      })
      fs.writeFileSync(
        fixture.metadataPath,
        `${JSON.stringify({ electronPid: process.pid, userDataDir: fixture.userDataDir }, null, 2)}\n`
      )
    },
    {
      agent: AGENT,
      capabilities: CAPABILITIES,
      computer: COMPUTER,
      metadataPath: path.join(ARTIFACT_DIR, 'launch.json'),
      rpcLogPath: RPC_LOG_PATH,
      userDataDir
    }
  )
}

async function openSettings(page: Page, pane: 'agents' | 'computers'): Promise<void> {
  await page.evaluate((targetPane) => {
    const state = window.__store?.getState()
    state?.openSettingsTarget({ pane: targetPane, repoId: null })
    state?.openSettingsPage()
  }, pane)
}

function readRpcMethods(): string[] {
  return readFileSync(RPC_LOG_PATH, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'method' in entry
        ? String(entry.method)
        : 'invalid-log-entry'
    )
}

test('captures hidden Computer setup, Stop, and Agent requirements without real runtime work', async ({
  dorkaPage,
  electronApp,
  registerPostElectronShutdownCleanup
}) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  writeFileSync(RPC_LOG_PATH, '')
  const isolatedPaths = await electronApp.evaluate(({ app }) => ({
    home: app.getPath('home'),
    userData: app.getPath('userData')
  }))
  const userDataDir = isolatedPaths.userData
  expect(isolatedPaths.home).toBe(realpathSync.native(path.join(userDataDir, 'home')))
  const electronProcess = electronApp.process()
  await installFailClosedRuntime(electronApp, userDataDir)
  await dorkaPage.reload()
  await dorkaPage.waitForFunction(() => Boolean(window.__store))

  registerPostElectronShutdownCleanup(async () => {
    const cleanup = {
      electronPid: electronProcess.pid,
      electronExited: electronProcess.exitCode !== null || electronProcess.signalCode !== null,
      userDataRemoved: !existsSync(userDataDir)
    }
    writeFileSync(path.join(ARTIFACT_DIR, 'cleanup.json'), `${JSON.stringify(cleanup, null, 2)}\n`)
    expect(cleanup.electronExited).toBe(true)
    expect(cleanup.userDataRemoved).toBe(true)
  })

  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows()
        return (
          windows.length > 0 &&
          windows.every(
            (window) => !window.isVisible() && !window.isFocused() && !window.isDestroyed()
          )
        )
      })
    )
    .toBe(true)

  await openSettings(dorkaPage, 'computers')
  const computers = dorkaPage.locator('[data-settings-section="computers"]')
  await expect(computers.getByText('QA Computer')).toBeVisible()
  await computers.getByText('Setup', { exact: true }).click()
  await expect(computers.getByText('DORKA_QA_TOKEN')).toBeVisible()
  await computers.screenshot({ path: path.join(ARTIFACT_DIR, 'computer-setup.png') })

  await computers.getByRole('button', { name: 'Stop', exact: true }).click()
  const stopDialog = dorkaPage.getByRole('dialog', { name: 'Stop QA Computer?' })
  await expect(stopDialog).toBeVisible()
  await stopDialog.screenshot({ path: path.join(ARTIFACT_DIR, 'computer-stop.png') })
  await stopDialog.getByRole('button', { name: 'Stop Computer' }).click()
  await expect(computers.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

  await openSettings(dorkaPage, 'agents')
  const agents = dorkaPage.locator('[data-settings-section="agents"]')
  await expect(agents.getByText('Release reviewer')).toBeVisible()
  await agents.getByRole('button', { name: 'Requirements · 2' }).click()
  await expect(agents.getByText('Names are checked on the selected Computer.')).toBeVisible()
  await dorkaPage.screenshot({ path: path.join(ARTIFACT_DIR, 'agent-requirements.png') })

  expect(readRpcMethods()).toEqual(
    expect.arrayContaining([
      'status.get',
      'computers.list',
      'computers.configuration.get',
      'computers.gitIdentity.get',
      'computers.stop',
      'agents.list',
      'agents.runs.list'
    ])
  )
  expect(readRpcMethods()).not.toContain('computers.start')
})
