/**
 * E2E tests for terminal pane scrollback retention.
 *
 * User Prompt:
 * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
 */

import { test, expect } from './helpers/dorka-app'
import {
  discoverActivePtyId,
  execInTerminal,
  closeActiveTerminalPane,
  countVisibleTerminalPanes,
  focusLastTerminalPane,
  splitActiveTerminalPane,
  waitForTerminalOutput,
  waitForPaneCount,
  getTerminalContent
} from './helpers/terminal'
import {
  getActiveWorktreeId,
  getActiveTabType,
  getWorktreeTabs,
  getAllWorktreeIds,
  switchToOtherWorktree,
  switchToWorktree,
  ensureTerminalVisible
} from './helpers/store'
import { pressShortcut } from './helpers/shortcuts'
import { registerTerminalPaneMountReadiness } from './helpers/terminal-pane-mount-readiness'

// Why: keep the suite serial so the headful pane tests never ask Playwright to
// open multiple visible Electron windows at once.
test.describe.configure({ mode: 'serial' })
test.describe('Terminal Panes', () => {
  registerTerminalPaneMountReadiness()

  /**
   * User Prompt:
   * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
   */
  test('terminal pane retains content when switching tabs and back', async ({ dorkaPage }) => {
    // Write a unique marker to the current terminal
    const ptyId = await discoverActivePtyId(dorkaPage)
    const marker = `RETAIN_TEST_${Date.now()}`
    await execInTerminal(dorkaPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(dorkaPage, marker)

    // Create a new terminal tab (Cmd/Ctrl+T) to switch away
    const worktreeId = (await getActiveWorktreeId(dorkaPage))!
    await pressShortcut(dorkaPage, 't')

    // Wait for the new tab to appear
    await expect
      .poll(async () => (await getWorktreeTabs(dorkaPage, worktreeId)).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)

    // Verify we're still on a terminal tab
    const activeType = await getActiveTabType(dorkaPage)
    expect(activeType).toBe('terminal')

    // Switch back to the previous tab with Cmd/Ctrl+Shift+[
    await pressShortcut(dorkaPage, 'BracketLeft', { shift: true })

    // Verify the marker is still present
    await expect
      .poll(async () => (await getTerminalContent(dorkaPage)).includes(marker), { timeout: 5_000 })
      .toBe(true)

    // Clean up the extra tab
    await pressShortcut(dorkaPage, 'BracketRight', { shift: true })
    await pressShortcut(dorkaPage, 'w')
  })

  /**
   * User Prompt:
   * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
   */
  test('terminal pane retains content when splitting and closing a pane', async ({ dorkaPage }) => {
    // Write a unique marker to the current terminal
    const ptyId = await discoverActivePtyId(dorkaPage)
    const marker = `SPLIT_RETAIN_${Date.now()}`
    await execInTerminal(dorkaPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(dorkaPage, marker)

    const panesBefore = await countVisibleTerminalPanes(dorkaPage)

    // Split the terminal right
    await splitActiveTerminalPane(dorkaPage, 'vertical')
    await waitForPaneCount(dorkaPage, panesBefore + 1)

    await focusLastTerminalPane(dorkaPage)
    await closeActiveTerminalPane(dorkaPage)
    await waitForPaneCount(dorkaPage, panesBefore)

    // The original pane should still have our marker
    await expect
      .poll(async () => (await getTerminalContent(dorkaPage)).includes(marker), { timeout: 5_000 })
      .toBe(true)
  })

  /**
   * User Prompt:
   * - terminal panes retain state when switching tabs and when you make / close a pane / switch worktrees
   */
  test('terminal pane retains content when switching worktrees and back', async ({ dorkaPage }) => {
    const allWorktreeIds = await getAllWorktreeIds(dorkaPage)
    if (allWorktreeIds.length < 2) {
      test.skip(true, 'Need at least 2 worktrees to test worktree switching')
      return
    }

    const worktreeId = (await getActiveWorktreeId(dorkaPage))!

    // Write a unique marker to the current terminal
    const ptyId = await discoverActivePtyId(dorkaPage)
    const marker = `WT_RETAIN_${Date.now()}`
    await execInTerminal(dorkaPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(dorkaPage, marker)

    // Switch to a different worktree via the store
    const otherId = await switchToOtherWorktree(dorkaPage, worktreeId)
    expect(otherId).not.toBeNull()
    await expect.poll(async () => getActiveWorktreeId(dorkaPage), { timeout: 5_000 }).toBe(otherId)

    // Switch back to the original worktree
    await switchToWorktree(dorkaPage, worktreeId)
    await expect
      .poll(async () => getActiveWorktreeId(dorkaPage), { timeout: 5_000 })
      .toBe(worktreeId)

    // Why: after a worktree round-trip, the split-group container transitions
    // from hidden back to visible. In headful Electron runs the terminal tree
    // can take longer than a single render turn to rebind its serialize addon
    // after the worktree activation cascade. Waiting directly for the retained
    // marker proves the user-visible behavior without failing early on the
    // intermediate manager-remount timing.
    await ensureTerminalVisible(dorkaPage)

    // The terminal should still contain our marker
    await expect
      .poll(async () => (await getTerminalContent(dorkaPage)).includes(marker), { timeout: 20_000 })
      .toBe(true)
  })
})
