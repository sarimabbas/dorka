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
const UPDATED_REFERENCES = {
  version: 1 as const,
  items: [{ kind: 'skill' as const, name: 'code-review', scope: 'either' as const }]
}
const CONFIGURATION_REQUEST = {
  resources: { cpus: 4, memoryMb: 4096, pids: 256 },
  environment: { preserve: ['DORKA_QA_TOKEN'], set: {} },
  premounts: []
}
const ALLOWED_RPC_METHODS = new Set([
  'status.get',
  'computers.list',
  'computers.configuration.get',
  'computers.configuration.plan',
  'computers.configuration.replace',
  'computers.gitIdentity.get',
  'computers.stop',
  'agents.list',
  'agents.references.update',
  'agents.runs.list'
])

test.use({
  seedTestRepo: false,
  dorkaAppExtraEnv: { DORKA_BACKGROUND_LAUNCH: '1' }
})

async function installFailClosedRuntime(
  electronApp: ElectronApplication,
  userDataDir: string,
  capabilities: RuntimeCapability[] = CAPABILITIES
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
          case 'computers.configuration.plan':
            return success({
              outcome: 'planned',
              plan: {
                id: fixture.computer.id,
                revision: 'qa-revision',
                desiredState: computerState,
                configuration: fixture.configurationRequest,
                replacementRequired: true,
                interruption: 'restart',
                changes: {
                  resources: ['cpus'],
                  environment: { added: [], changed: [], removed: [] },
                  premountsChanged: false
                }
              }
            })
          case 'computers.configuration.replace':
            return success({
              outcome: 'replaced',
              snapshot: {
                id: fixture.computer.id,
                revision: 'qa-replaced-revision',
                desiredState: computerState,
                configuration: {
                  resources: fixture.configurationRequest.resources,
                  environment: ['DORKA_QA_TOKEN'],
                  premounts: []
                }
              }
            })
          case 'computers.gitIdentity.get':
            return success({ name: 'QA Reviewer', email: 'qa@example.test' })
          case 'computers.stop':
            computerState = 'stopped'
            return success({ ...fixture.computer, state: computerState })
          case 'agents.list':
            return success([fixture.agent])
          case 'agents.references.update':
            return success({
              outcome: 'updated',
              agent: { ...fixture.agent, revision: 4, references: fixture.updatedReferences }
            })
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
      capabilities,
      computer: COMPUTER,
      configurationRequest: CONFIGURATION_REQUEST,
      metadataPath: path.join(ARTIFACT_DIR, 'launch.json'),
      rpcLogPath: RPC_LOG_PATH,
      updatedReferences: UPDATED_REFERENCES,
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

type RpcLogEntry = { method: string; params: unknown }

function readRpcLog(): RpcLogEntry[] {
  return readFileSync(RPC_LOG_PATH, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

async function expectWindowsHidden(electronApp: ElectronApplication): Promise<void> {
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
  const realUserDataDir = realpathSync.native(userDataDir)
  const realTemporaryRoot = realpathSync.native(tmpdir())
  expect(realUserDataDir.startsWith(`${realTemporaryRoot}${path.sep}`)).toBe(true)
  expect(path.basename(realUserDataDir)).toMatch(/^dorka-e2e-userdata-/)
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

  await expectWindowsHidden(electronApp)

  await openSettings(dorkaPage, 'agents')
  let agents = dorkaPage.locator('[data-settings-section="agents"]')
  await expect(agents.getByText('Release reviewer')).toBeVisible()
  await agents.getByRole('button', { name: 'Requirements · 2' }).click()
  await expect(agents.getByText('Names are checked on the selected Computer.')).toBeVisible()
  await agents.getByRole('button', { name: 'Remove linear' }).click()
  await dorkaPage.screenshot({ path: path.join(ARTIFACT_DIR, 'agent-requirements.png') })
  await agents.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(agents.getByRole('button', { name: 'Requirements · 1' })).toBeVisible()

  await openSettings(dorkaPage, 'computers')
  const computers = dorkaPage.locator('[data-settings-section="computers"]')
  await expect(computers.getByText('QA Computer')).toBeVisible()
  await computers.getByText('Setup', { exact: true }).click()
  await expect(computers.getByText('DORKA_QA_TOKEN')).toBeVisible()
  const cpus = computers.getByLabel('CPUs')
  await cpus.fill('4')
  await computers.getByRole('button', { name: 'Review changes' }).click()
  await expect(computers.getByText('Ready to apply')).toBeVisible()
  await computers.screenshot({ path: path.join(ARTIFACT_DIR, 'computer-setup-review.png') })
  await computers.getByRole('button', { name: 'Apply & restart' }).click()
  await expect(cpus).toHaveValue('4')

  await computers.getByRole('button', { name: 'Stop', exact: true }).click()
  let stopDialog = dorkaPage.getByRole('dialog', { name: 'Stop QA Computer?' })
  await expect(stopDialog).toBeVisible()
  await stopDialog.getByRole('button', { name: 'Cancel' }).click()
  expect(readRpcLog().filter(({ method }) => method === 'computers.stop')).toEqual([])

  await computers.getByRole('button', { name: 'Stop', exact: true }).click()
  stopDialog = dorkaPage.getByRole('dialog', { name: 'Stop QA Computer?' })
  await stopDialog.screenshot({ path: path.join(ARTIFACT_DIR, 'computer-stop.png') })
  await stopDialog.getByRole('button', { name: 'Stop Computer' }).click()
  await expect(computers.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

  const expectedConfigurationParams = {
    id: COMPUTER.id,
    expectedRevision: 'qa-revision',
    expectedDesiredState: 'running',
    configuration: CONFIGURATION_REQUEST
  }
  const log = readRpcLog()
  expect(log.filter(({ method }) => method === 'agents.references.update')).toEqual([
    {
      method: 'agents.references.update',
      params: { agentId: AGENT.id, expectedRevision: 3, references: UPDATED_REFERENCES }
    }
  ])
  expect(log.filter(({ method }) => method === 'computers.configuration.plan')).toEqual([
    { method: 'computers.configuration.plan', params: expectedConfigurationParams }
  ])
  expect(log.filter(({ method }) => method === 'computers.configuration.replace')).toEqual([
    { method: 'computers.configuration.replace', params: expectedConfigurationParams }
  ])
  expect(log.filter(({ method }) => method === 'computers.stop')).toEqual([
    { method: 'computers.stop', params: { id: COMPUTER.id } }
  ])
  expect(log.map(({ method }) => method)).not.toContain('computers.start')

  await installFailClosedRuntime(
    electronApp,
    userDataDir,
    CAPABILITIES.filter((capability) => capability !== AGENT_REFERENCES_RUNTIME_CAPABILITY)
  )
  await dorkaPage.reload()
  await dorkaPage.waitForFunction(() => Boolean(window.__store))
  await openSettings(dorkaPage, 'agents')
  agents = dorkaPage.locator('[data-settings-section="agents"]')
  await expect(agents.getByText('Release reviewer')).toBeVisible()
  await expect(agents.getByRole('button', { name: /Requirements/ })).toHaveCount(0)
  await agents.screenshot({ path: path.join(ARTIFACT_DIR, 'agent-requirements-unsupported.png') })
  const finalLog = readRpcLog()
  expect(finalLog.filter(({ method }) => method === 'agents.references.update')).toHaveLength(1)
  expect(finalLog.filter(({ method }) => !ALLOWED_RPC_METHODS.has(method))).toEqual([])
  await expectWindowsHidden(electronApp)
})
