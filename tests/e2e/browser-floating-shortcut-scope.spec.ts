// STA-8147 follow-up: the floating browser and a focused split browser each answer only the
// chrome chords pressed inside them.

import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/dorka-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  browserAddressBar,
  browserOverlay,
  createTerminalBrowserSplit,
  focusBrowserGroup,
  pressKeyInBrowserGuest,
  shortcutModifier
} from './helpers/browser-split-fixture'
import {
  guestLoadStarts,
  navigateGuest,
  recordGuestLoadStarts,
  waitForGuestIdle,
  waitForGuestUrl
} from './helpers/browser-split-guest-probes'
import { startBrowserSplitPageServer } from './helpers/browser-split-page-server'

// Why: mirrors FLOATING_TERMINAL_WORKTREE_ID in src/shared/constants.ts.
const FLOATING_WORKTREE_ID = 'global-floating-terminal'
const FLOATING_PANEL = '[data-floating-terminal-panel]'
const isMac = process.platform === 'darwin'
const backChord = isMac ? 'Meta+BracketLeft' : 'Alt+ArrowLeft'
const forwardChord = isMac ? 'Meta+BracketRight' : 'Alt+ArrowRight'

async function openFloatingBrowser(
  page: Page,
  url: string
): Promise<{ browserTabId: string; browserPageId: string }> {
  const floating = await page.evaluate(
    ({ worktreeId, initialUrl }) => {
      const store = window.__store
      if (!store) {
        throw new Error('Store unavailable')
      }
      store.setState({ settings: { ...store.getState().settings, floatingTerminalEnabled: true } })
      const state = store.getState()
      const tab = state.createBrowserTab(worktreeId, initialUrl, {
        activate: true,
        focusAddressBar: false,
        targetGroupId: state.ensureWorktreeRootGroup(worktreeId),
        browserRuntimeEnvironmentId: null
      })
      if (!tab.activePageId) {
        throw new Error('Floating browser page unavailable')
      }
      return { browserTabId: tab.id, browserPageId: tab.activePageId }
    },
    { worktreeId: FLOATING_WORKTREE_ID, initialUrl: url }
  )
  // Why: the toggle listener closes over floatingTerminalEnabled, so wait for the panel to mount.
  await expect(page.locator(FLOATING_PANEL)).toHaveCount(1)
  const openPanel = page.locator(`${FLOATING_PANEL}[aria-hidden="false"]`)
  if ((await openPanel.count()) === 0) {
    await page.evaluate(() => window.dispatchEvent(new Event('dorka-toggle-floating-terminal')))
  }
  await expect(
    openPanel.locator(`[data-browser-overlay-tab-id="${floating.browserTabId}"]`)
  ).toBeVisible()
  return floating
}

function findInput(page: Page, browserTabId: string) {
  return browserOverlay(page, browserTabId).getByPlaceholder('Find in page...')
}

function grabButton(page: Page, browserTabId: string) {
  return browserOverlay(page, browserTabId).getByRole('button', {
    name: 'Grab page element',
    exact: true
  })
}

// Why: a non-editable chrome target, so reload and grab are not skipped as text-field keys.
async function focusChrome(page: Page, browserTabId: string): Promise<void> {
  const target = grabButton(page, browserTabId)
  await expect(target).toBeEnabled()
  await target.focus()
  await expect(target).toBeFocused()
}

test.describe('floating browser shortcut scope', () => {
  test.beforeEach(async ({ dorkaPage }) => {
    await waitForSessionReady(dorkaPage)
    await waitForActiveWorktree(dorkaPage)
    await ensureTerminalVisible(dorkaPage)
  })

  test('chrome shortcuts act only in the pane that owns the key press', async ({ dorkaPage }) => {
    const server = await startBrowserSplitPageServer()
    try {
      const split = await createTerminalBrowserSplit(dorkaPage, server.pageUrl('split', 1))
      const floating = await openFloatingBrowser(dorkaPage, server.pageUrl('float', 1))
      await focusBrowserGroup(dorkaPage, split.browserGroupId)
      await waitForGuestUrl(dorkaPage, split.browserTabId, server.pageUrl('split', 1))
      await waitForGuestUrl(dorkaPage, floating.browserTabId, server.pageUrl('float', 1))
      await navigateGuest(dorkaPage, split.browserTabId, server.pageUrl('split', 2))
      await navigateGuest(dorkaPage, floating.browserTabId, server.pageUrl('float', 2))

      const cases = [
        {
          name: 'float',
          owner: floating.browserTabId,
          other: split.browserTabId,
          otherName: 'split'
        },
        {
          name: 'split',
          owner: split.browserTabId,
          other: floating.browserTabId,
          otherName: 'float'
        }
      ]
      for (const { name, owner, other, otherName } of cases) {
        await test.step(`keys pressed in the ${name} browser chrome`, async () => {
          await focusChrome(dorkaPage, owner)
          await dorkaPage.keyboard.press(backChord)
          await waitForGuestUrl(dorkaPage, owner, server.pageUrl(name, 1))
          await waitForGuestIdle(dorkaPage, other)
          await waitForGuestUrl(dorkaPage, other, server.pageUrl(otherName, 2))
          await focusChrome(dorkaPage, owner)
          await dorkaPage.keyboard.press(forwardChord)
          await waitForGuestUrl(dorkaPage, owner, server.pageUrl(name, 2))
          await waitForGuestUrl(dorkaPage, other, server.pageUrl(otherName, 2))

          await recordGuestLoadStarts(dorkaPage, [owner, other])
          await focusChrome(dorkaPage, owner)
          await dorkaPage.keyboard.press(`${shortcutModifier}+r`)
          await expect.poll(() => guestLoadStarts(dorkaPage, owner)).toBeGreaterThan(0)
          await waitForGuestIdle(dorkaPage, owner)
          expect(await guestLoadStarts(dorkaPage, other)).toBe(0)

          await focusChrome(dorkaPage, owner)
          await dorkaPage.keyboard.press(`${shortcutModifier}+f`)
          await expect(findInput(dorkaPage, owner)).toBeFocused()
          await expect(findInput(dorkaPage, other)).toBeHidden()
          await dorkaPage.keyboard.press('Escape')
          await expect(findInput(dorkaPage, owner)).toBeHidden()

          await focusChrome(dorkaPage, owner)
          await dorkaPage.keyboard.press(`${shortcutModifier}+l`)
          await expect(browserAddressBar(dorkaPage, owner)).toBeFocused()

          await focusChrome(dorkaPage, owner)
          await dorkaPage.keyboard.press(`${shortcutModifier}+c`)
          await expect(grabButton(dorkaPage, owner)).toHaveAttribute('data-variant', 'default')
          await expect(grabButton(dorkaPage, other)).toHaveAttribute('data-variant', 'ghost')
          await grabButton(dorkaPage, owner).click()
          await expect(grabButton(dorkaPage, owner)).toHaveAttribute('data-variant', 'ghost')
        })
      }

      await test.step('back pressed inside the floating page', async () => {
        await pressKeyInBrowserGuest(
          dorkaPage,
          floating.browserTabId,
          floating.browserPageId,
          isMac ? '[' : 'Left',
          [isMac ? 'meta' : 'alt']
        )
        await waitForGuestUrl(dorkaPage, floating.browserTabId, server.pageUrl('float', 1))
        await waitForGuestUrl(dorkaPage, split.browserTabId, server.pageUrl('split', 2))
      })
    } finally {
      await server.close()
    }
  })
})
