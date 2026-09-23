import { expect, test } from './helpers/dorka-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { crashGuestRenderer } from './browser-guest-runtime-oracle'
import { observeBrowserLoadingSurface } from './browser-loading-surface-oracle'

test('browser host follows the theme before content and preserves the webpage canvas', async ({
  dorkaPage,
  electronApp
}, testInfo) => {
  await waitForSessionReady(dorkaPage)
  await ensureTerminalVisible(dorkaPage)
  await waitForActiveWorktree(dorkaPage)
  const observations = await observeBrowserLoadingSurface(
    dorkaPage,
    (name) => testInfo.outputPath(name),
    async (id) => {
      await crashGuestRenderer(electronApp, id)
    }
  )
  expect(observations.filter((entry) => !entry.pass)).toEqual([])
})
