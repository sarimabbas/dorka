import { expect, test } from './helpers/dorka-app'
import type { Page } from '@stablyai/playwright-test'
import { focusActiveTerminalInput } from './helpers/terminal'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  browserAddressBar,
  createBrowserSplit,
  createTerminalBrowserSplit,
  focusBrowserAddressBar,
  focusBrowserGroup,
  guestModifier,
  pressKeyInBrowserGuest,
  shortcutModifier as modifier,
  waitForFocusedGroup
} from './helpers/browser-split-fixture'

function browserFindInput(page: Page) {
  return page.getByPlaceholder('Find in page...')
}

function browserFindCloseButton(page: Page) {
  return browserFindInput(page).locator('xpath=..').getByTitle('Close')
}

function browserSplitFindInput(page: Page, browserTabId: string) {
  return page
    .locator(`[data-browser-overlay-tab-id="${browserTabId}"]`)
    .getByPlaceholder('Find in page...')
}

async function pressFindInBrowserGuest(
  page: Page,
  browserTabId: string,
  browserPageId: string
): Promise<void> {
  await pressKeyInBrowserGuest(page, browserTabId, browserPageId, 'F', [guestModifier])
}

function terminalFindInput(page: Page) {
  return page.locator('[data-terminal-search-root] input:visible')
}

test.describe('browser split shortcuts', () => {
  test.beforeEach(async ({ dorkaPage }) => {
    await waitForSessionReady(dorkaPage)
    await waitForActiveWorktree(dorkaPage)
    await ensureTerminalVisible(dorkaPage)
  })

  test('routes repeated Find shortcuts to the focused terminal or browser split', async ({
    dorkaPage
  }) => {
    const fixture = await createTerminalBrowserSplit(dorkaPage)

    await dorkaPage.evaluate(({ terminalGroupId }) => {
      const state = window.__store?.getState()
      const worktreeId = state?.activeWorktreeId
      if (state && worktreeId) {
        state.focusGroup(worktreeId, terminalGroupId)
      }
    }, fixture)
    await focusActiveTerminalInput(dorkaPage)
    await waitForFocusedGroup(dorkaPage, fixture.terminalGroupId)
    await dorkaPage.keyboard.press(`${modifier}+f`)
    await expect(terminalFindInput(dorkaPage)).toBeFocused()
    await expect(browserFindInput(dorkaPage)).toBeHidden()
    await dorkaPage.keyboard.press('Escape')

    await focusBrowserGroup(dorkaPage, fixture.browserGroupId)
    await focusBrowserAddressBar(dorkaPage, fixture.browserTabId)
    await dorkaPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(dorkaPage)).toBeFocused()
    await expect(terminalFindInput(dorkaPage)).toBeHidden()
    await browserFindCloseButton(dorkaPage).click()
    await expect(browserFindInput(dorkaPage)).toBeHidden()

    await dorkaPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(dorkaPage)).toBeFocused()
    await browserFindCloseButton(dorkaPage).click()

    await dorkaPage.evaluate(({ browserTabId }) => {
      window.__store?.getState().closeBrowserTab(browserTabId)
    }, fixture)
    await expect(
      dorkaPage.locator(`[data-browser-overlay-tab-id="${fixture.browserTabId}"]`)
    ).toHaveCount(0)

    await focusActiveTerminalInput(dorkaPage)
    await dorkaPage.keyboard.press(`${modifier}+f`)
    await expect(terminalFindInput(dorkaPage)).toBeFocused()
    await expect(browserFindInput(dorkaPage)).toBeHidden()
  })

  test('opens Find only in the browser split whose guest owns the shortcut', async ({
    dorkaPage
  }) => {
    const fixture = await createBrowserSplit(dorkaPage)

    await pressFindInBrowserGuest(dorkaPage, fixture.firstBrowserTabId, fixture.firstBrowserPageId)

    await expect(browserSplitFindInput(dorkaPage, fixture.firstBrowserTabId)).toBeVisible()
    await expect(browserSplitFindInput(dorkaPage, fixture.secondBrowserTabId)).toBeHidden()
    await expect
      .poll(() =>
        dorkaPage.evaluate(
          ({ browserPageId, browserTabId }) =>
            window.__store
              ?.getState()
              .browserPagesByWorkspace[browserTabId]?.find((page) => page.id === browserPageId)
              ?.loadError?.code ?? null,
          {
            browserPageId: fixture.firstBrowserPageId,
            browserTabId: fixture.firstBrowserTabId
          }
        )
      )
      .toBeNull()
  })

  test('keeps browser Find available when split focus state is temporarily missing', async ({
    dorkaPage
  }) => {
    const fixture = await createTerminalBrowserSplit(dorkaPage)
    await focusBrowserGroup(dorkaPage, fixture.browserGroupId)
    const addressBar = browserAddressBar(dorkaPage, fixture.browserTabId)
    await focusBrowserAddressBar(dorkaPage, fixture.browserTabId)

    await dorkaPage.evaluate(() => {
      const store = window.__store
      const worktreeId = store?.getState().activeWorktreeId
      if (!store || !worktreeId) {
        throw new Error('Active worktree unavailable')
      }
      store.setState((state) => {
        const activeGroupIdByWorktree = { ...state.activeGroupIdByWorktree }
        delete activeGroupIdByWorktree[worktreeId]
        return { activeGroupIdByWorktree }
      })
    })
    await expect(addressBar).toBeFocused()

    await dorkaPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(dorkaPage)).toBeFocused()
    await expect(terminalFindInput(dorkaPage)).toBeHidden()
  })

  test('keeps browser Find available when the focused split ID is stale', async ({ dorkaPage }) => {
    const fixture = await createTerminalBrowserSplit(dorkaPage)
    await focusBrowserGroup(dorkaPage, fixture.browserGroupId)
    const addressBar = browserAddressBar(dorkaPage, fixture.browserTabId)
    await focusBrowserAddressBar(dorkaPage, fixture.browserTabId)

    await dorkaPage.evaluate(() => {
      const store = window.__store
      const worktreeId = store?.getState().activeWorktreeId
      if (!store || !worktreeId) {
        throw new Error('Active worktree unavailable')
      }
      store.setState((state) => ({
        activeGroupIdByWorktree: {
          ...state.activeGroupIdByWorktree,
          [worktreeId]: 'removed-group'
        }
      }))
    })
    await expect(addressBar).toBeFocused()

    await dorkaPage.keyboard.press(`${modifier}+f`)
    await expect(browserFindInput(dorkaPage)).toBeFocused()
    await expect(terminalFindInput(dorkaPage)).toBeHidden()
  })
})
