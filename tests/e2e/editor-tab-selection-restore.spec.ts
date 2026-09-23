import { test, expect } from './helpers/dorka-app'
import {
  activateGoldenWorktree,
  cleanupGoldenWorktree,
  createGoldenWorktree
} from './helpers/golden-source-control'
import { waitForSessionReady } from './helpers/store'

test('preserves highlighted editor text across worktree tab switches', async ({
  dorkaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const fixture = createGoldenWorktree(testRepoPath, 'editor-selection')
  registerPostElectronShutdownCleanup(async () => cleanupGoldenWorktree(testRepoPath, fixture))

  await waitForSessionReady(dorkaPage)
  await activateGoldenWorktree(dorkaPage, testRepoPath, fixture.worktreePath)
  await dorkaPage.evaluate(() => {
    const state = window.__store?.getState()
    state?.setRightSidebarTab('explorer')
    state?.setRightSidebarOpen(true)
  })

  const explorer = dorkaPage.locator('[data-dorka-explorer-shell]')
  const rowNamed = (name: string) =>
    explorer.locator('[data-file-explorer-row]').filter({
      has: dorkaPage.locator('[data-file-explorer-row-name]').getByText(name, { exact: true })
    })

  await rowNamed('package.json').dblclick()
  const monaco = dorkaPage.locator('.monaco-editor').first()
  await expect(monaco).toBeVisible({ timeout: 25_000 })
  await monaco.click()
  await dorkaPage.keyboard.press('ControlOrMeta+f')
  const findInput = monaco.locator('.find-widget .input[aria-label="Find"]')
  await expect(findInput).toBeVisible()
  await findInput.fill('dorka-e2e-test')
  await dorkaPage.keyboard.press('Enter')
  await dorkaPage.keyboard.press('Escape')

  await expect
    .poll(() => dorkaPage.evaluate(() => window.__monacoEditorE2E?.snapshot().selection ?? null), {
      message: 'Monaco did not select the searched text'
    })
    .not.toBeNull()
  const selectedRange = await dorkaPage.evaluate(
    () => window.__monacoEditorE2E?.snapshot().selection ?? null
  )
  if (!selectedRange) {
    throw new Error('Monaco selection disappeared before the tab switch')
  }
  expect([selectedRange.selectionStartLineNumber, selectedRange.selectionStartColumn]).not.toEqual([
    selectedRange.positionLineNumber,
    selectedRange.positionColumn
  ])
  if (process.env.DORKA_E2E_RECORD_VIDEO === '1') {
    await dorkaPage.waitForTimeout(700)
  }

  await rowNamed('src').click()
  await rowNamed('index.ts').click()
  await expect(dorkaPage.locator('.editor-header-path').first()).toContainText('index.ts', {
    timeout: 20_000
  })

  await dorkaPage.locator('[data-tab-id]').filter({ hasText: 'package.json' }).last().click()
  await expect(dorkaPage.locator('.editor-header-path').first()).toContainText('package.json', {
    timeout: 20_000
  })
  await expect
    .poll(() => dorkaPage.evaluate(() => window.__monacoEditorE2E?.snapshot().selection ?? null))
    .toEqual(selectedRange)
  await expect(monaco.locator('.selected-text').first()).toBeVisible()
  if (process.env.DORKA_E2E_RECORD_VIDEO === '1') {
    await dorkaPage.waitForTimeout(700)
  }
})
