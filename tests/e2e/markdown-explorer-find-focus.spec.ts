import { expect, test } from './helpers/dorka-app'
import { openFileExplorer } from './helpers/file-explorer'
import { pressShortcut } from './helpers/shortcuts'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('Explorer-opened Markdown accepts the find shortcut without a document click', async ({
  dorkaPage
}) => {
  await waitForSessionReady(dorkaPage)
  await waitForActiveWorktree(dorkaPage)
  await openFileExplorer(dorkaPage)

  const readmeRow = dorkaPage.locator('[data-file-explorer-row]').filter({ hasText: 'README.md' })
  await expect(readmeRow).toBeVisible({ timeout: 10_000 })
  await readmeRow.focus()
  await readmeRow.click()

  await expect(dorkaPage.locator('.rich-markdown-editor')).toBeVisible({ timeout: 25_000 })
  await pressShortcut(dorkaPage, 'f')

  await expect(
    dorkaPage.getByRole('textbox', { name: 'Find in rich markdown editor' })
  ).toBeVisible()
})
