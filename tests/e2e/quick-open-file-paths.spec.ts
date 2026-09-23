import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/dorka-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const relativeFilePath =
  'packages/dorka/src/renderer/src/components/navigation/worktree/quick-open/long-path-fixtures/very-deeply-nested-folder/QuickOpenTarget.tsx'

test('cmd+p quick open prioritizes the filename and reveals the full path on hover', async ({
  electronApp,
  dorkaPage,
  testRepoPath
}) => {
  const filePath = path.join(testRepoPath, ...relativeFilePath.split('/'))
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, 'export const QuickOpenTarget = true\n')

  await waitForSessionReady(dorkaPage)
  await waitForActiveWorktree(dorkaPage)
  await ensureTerminalVisible(dorkaPage)

  // Headless Playwright keyboard events bypass Electron’s before-input-event shortcut path.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('ui:openQuickOpen')
  })
  const dialog = dorkaPage.getByRole('dialog', { name: 'Go to file' })
  await expect(dialog).toBeVisible()
  const inputBox = await dialog.locator('[data-cmdk-input-wrapper]').boundingBox()
  expect(inputBox).not.toBeNull()
  expect(inputBox!.height).toBeLessThanOrEqual(45)
  const input = dialog.locator('input[placeholder="Go to file..."]')
  await input.fill('QuickOpenTarget')

  const row = dialog.getByRole('option').filter({ hasText: 'QuickOpenTarget.tsx' }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('packages/dorka/src/renderer/src/components/navigation/')
  const rowBox = await row.boundingBox()
  expect(rowBox).not.toBeNull()
  expect(rowBox!.height).toBeLessThanOrEqual(29)
  const rowText = await row.textContent()
  expect(rowText?.indexOf('QuickOpenTarget.tsx')).toBeLessThan(
    rowText?.indexOf('packages/dorka/src/renderer/src/components/navigation/') ?? -1
  )

  const tooltip = dorkaPage
    .locator('[data-slot="tooltip-content"]')
    .filter({ hasText: relativeFilePath })
  // Streaming results can remount the row under a stationary pointer, and a
  // tooltip left open from a prior attempt can swallow the next hover.
  await expect(async () => {
    await dorkaPage.mouse.move(8, 8)
    const currentRow = dialog.getByRole('option').filter({ hasText: 'QuickOpenTarget.tsx' }).first()
    await expect(currentRow).toBeVisible()
    const currentBox = await currentRow.boundingBox()
    if (!currentBox) {
      throw new Error('Quick Open result remounted before hover')
    }
    await dorkaPage.mouse.move(currentBox.x + 20, currentBox.y + 12)
    await dorkaPage.mouse.move(currentBox.x + 40, currentBox.y + 12)
    await expect(tooltip).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000, intervals: [100, 250, 500] })

  // Exact cursor placement is arithmetic, unit-tested via cursorTooltipOffsets.
  // Asserting it here measures the app mid-reflow and is flaky; what E2E is
  // uniquely good for is that the tooltip really opens with the whole path.
  await expect(tooltip).toBeVisible()

  const proofPath = process.env.DORKA_QUICK_OPEN_PROOF_PATH
  if (proofPath) {
    await dorkaPage.screenshot({ path: proofPath })
  }
})
