import { execFileSync } from 'node:child_process'
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/dorka-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test.use({ dismissOnboarding: false, seedTestRepo: false })

async function createGitRepo(): Promise<string> {
  const root = realpathSync.native(await mkdtemp(path.join(os.tmpdir(), 'dorka-e2e-golden-fresh-')))
  const repoPath = path.join(root, 'golden-fresh-project')
  mkdirSync(repoPath)
  execFileSync('git', ['init'], { cwd: repoPath, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'e2e@test.local'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.name', 'E2E Test'], { cwd: repoPath })
  writeFileSync(path.join(repoPath, 'README.md'), '# golden-fresh-project\n')
  execFileSync('git', ['add', 'README.md'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath })
  return repoPath
}

async function stubFolderPicker(
  electronApp: ElectronApplication,
  selectedPath: string
): Promise<void> {
  await electronApp.evaluate(({ dialog }, folderPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folderPath],
      bookmarks: []
    })
  }, selectedPath)
}

async function selectCodexAndSkipToProject(page: Page): Promise<void> {
  const codexButton = page.getByRole('button', { name: /^Codex\s/ }).first()
  if (!(await codexButton.isVisible())) {
    await page.getByText(/Show \d+ more agents/).click()
  }
  await codexButton.click()
  const footer = page.locator('footer').filter({ has: page.getByRole('button', { name: /Skip/i }) })
  await footer.getByRole('button', { name: /^Skip to project setup$/i }).click()
  await expect(page.getByRole('dialog', { name: /Add a project/i })).toBeVisible()
}

test('fresh profile opens a live project terminal @golden', async ({
  electronApp,
  dorkaPage,
  registerPostElectronShutdownCleanup
}) => {
  await waitForSessionReady(dorkaPage)
  await expect(dorkaPage.locator('#root')).toBeVisible()
  await expect(dorkaPage.getByRole('heading', { name: /Pick your default agent/i })).toBeVisible()

  await selectCodexAndSkipToProject(dorkaPage)
  const repoPath = await createGitRepo()
  registerPostElectronShutdownCleanup(async () =>
    rmSync(path.dirname(repoPath), { recursive: true, force: true })
  )
  await stubFolderPicker(electronApp, repoPath)
  await dorkaPage
    .getByRole('button', { name: /Browse for a folder|Open a folder|Browse folder/i })
    .click()

  await expect(dorkaPage.getByText(path.basename(repoPath), { exact: true }).first()).toBeVisible({
    timeout: 30_000
  })
  await waitForActiveWorktree(dorkaPage)
  await ensureTerminalVisible(dorkaPage, 30_000)
  await waitForActiveTerminalManager(dorkaPage, 30_000)
  const ptyId = await waitForActivePanePtyId(dorkaPage, 30_000)
  await expect.poll(() => dorkaPage.evaluate((id) => window.api.pty.hasPty(id), ptyId)).toBe(true)

  const marker = `dorka-e2e-fresh-${Date.now()}`
  await focusActiveTerminalInput(dorkaPage)
  await dorkaPage.keyboard.type(`echo ${marker}`)
  await dorkaPage.keyboard.press('Enter')
  await expect
    .poll(async () => (await getTerminalContent(dorkaPage)).split(marker).length - 1, {
      message: 'marker should appear in both the echoed command and command output'
    })
    .toBeGreaterThanOrEqual(2)

  await focusActiveTerminalInput(dorkaPage)
  await dorkaPage.keyboard.type('git rev-parse --show-toplevel')
  await dorkaPage.keyboard.press('Enter')
  await expect
    .poll(async () => (await getTerminalContent(dorkaPage)).replaceAll('\\', '/'), {
      message: 'fresh project terminal should start in the selected repository'
    })
    .toContain(repoPath.replaceAll('\\', '/'))
})
