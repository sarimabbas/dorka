import { openSidebarWorkspaceComposer } from './helpers/sidebar-project-dialog'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/dorka-app'
import {
  ensureTerminalVisible,
  getActiveWorktreeId,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import { createTerminalTabFromMenu } from './helpers/terminal-tab-menu'
import {
  execInTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'
import { splitMarkerEchoCommand } from './terminal-marker-echo-command'
import { waitForPtyShellEcho } from './terminal-pty-readiness'

async function createWorkspace(page: Page, name: string): Promise<void> {
  await openSidebarWorkspaceComposer(page)
  const dialog = page.getByRole('dialog', { name: /Create (Workspace|Worktree)/i })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder(/Type a name/i).fill(name)
  await dialog.getByRole('button', { name: /Create (Workspace|Worktree)/i }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

async function removeCreatedWorktree(page: Page, worktreeId: string): Promise<void> {
  await page.evaluate(async (id) => {
    await window.__store?.getState().removeWorktree(id, true)
  }, worktreeId)
}

test('creates a worktree, keeps its terminal isolated, and switches back @golden', async ({
  dorkaPage
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(dorkaPage)
  const originalWorktreeId = await waitForActiveWorktree(dorkaPage)
  await waitForActiveTerminalManager(dorkaPage, 30_000)
  const parentPtyId = await waitForActivePanePtyId(dorkaPage)
  const workspaceName = `golden-switch-${Date.now()}`
  let childWorktreeId: string | null = null

  try {
    await createWorkspace(dorkaPage, workspaceName)
    await expect(
      dorkaPage.locator('[role="option"][aria-current="page"]').filter({ hasText: workspaceName })
    ).toBeVisible({ timeout: 30_000 })
    childWorktreeId = await waitForActiveWorktree(dorkaPage)
    // Why: the cleanup force-removes childWorktreeId, so it must never resolve to the original.
    expect(childWorktreeId).not.toBe(originalWorktreeId)
    await expect(
      dorkaPage.locator(`[role="option"][data-worktree-id="${childWorktreeId}"]`)
    ).toHaveAttribute('aria-current', 'page')

    await createTerminalTabFromMenu(dorkaPage)
    await waitForActiveTerminalManager(dorkaPage, 30_000)
    const childPtyId = await waitForActivePanePtyId(dorkaPage)
    expect(childPtyId).not.toBe(parentPtyId)
    await waitForPtyShellEcho(dorkaPage, childPtyId, 15_000)
    await execInTerminal(dorkaPage, childPtyId, splitMarkerEchoCommand('worktree', '-b'))
    await waitForTerminalOutput(dorkaPage, 'worktree-b')

    await dorkaPage.locator(`[role="option"][data-worktree-id="${originalWorktreeId}"]`).click()
    await expect(
      dorkaPage.locator(`[role="option"][data-worktree-id="${originalWorktreeId}"]`)
    ).toHaveAttribute('aria-current', 'page', { timeout: 20_000 })
    // Why: sidebar aria-current can land before the store/terminal remount.
    // Mac release goldens then wait 30s on a child tab whose PaneManager is gone.
    await expect
      .poll(() => getActiveWorktreeId(dorkaPage), {
        timeout: 20_000,
        message: 'store did not activate the original worktree after sidebar click'
      })
      .toBe(originalWorktreeId)
    await ensureTerminalVisible(dorkaPage)
    await waitForActiveTerminalManager(dorkaPage, 30_000)
    expect(await waitForActivePanePtyId(dorkaPage, 30_000)).toBe(parentPtyId)
  } finally {
    if (childWorktreeId) {
      if ((await getActiveWorktreeId(dorkaPage).catch(() => null)) !== originalWorktreeId) {
        await dorkaPage
          .locator(`[role="option"][data-worktree-id="${originalWorktreeId}"]`)
          .click()
          .catch(() => undefined)
      }
      await removeCreatedWorktree(dorkaPage, childWorktreeId).catch(() => undefined)
    }
  }
})
