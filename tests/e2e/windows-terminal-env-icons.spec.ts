import { test, expect } from './helpers/dorka-app'
import { getFirstWslDistro, useWslRuntimeForActiveProject } from './helpers/wsl-golden-stub-agent'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'

test.describe('Windows terminal env and shell identity', () => {
  test.beforeEach(async ({ dorkaPage }) => {
    await waitForSessionReady(dorkaPage)
    await waitForActiveWorktree(dorkaPage)
    await ensureTerminalVisible(dorkaPage)
  })

  test('dev terminal preserves parent PATH so PATH commands resolve', async ({ dorkaPage }) => {
    await waitForActiveTerminalManager(dorkaPage)

    const ptyId = await waitForActivePanePtyId(dorkaPage)
    const marker = `__DORKA_E2E_NODE_PATH_${Date.now()}__`

    // Why: before the dev PATH fallback, daemon-spawned PTYs could get PATH set
    // to only Dorka's dev CLI bin. A real terminal command catches that failure.
    await execInTerminal(dorkaPage, ptyId, `node -e "console.log('${marker}')"`)

    await waitForTerminalOutput(dorkaPage, marker, 15_000)
  })

  test('native Windows tab icons stay pinned to the effective shell at tab creation', async ({
    dorkaPage
  }) => {
    test.skip(process.platform !== 'win32', 'Windows shell icons only render on Windows')

    const tabIds = await dorkaPage.evaluate(() => {
      const store = window.__store
      if (!store) {
        throw new Error('Store unavailable')
      }
      const state = store.getState()
      const worktreeId = state.activeWorktreeId
      if (!worktreeId) {
        throw new Error('No active worktree')
      }

      // Native project ownership makes a global WSL shell fall back to PowerShell.
      store.setState({
        settings: { ...state.settings!, terminalWindowsShell: 'wsl.exe' }
      })
      const fallbackTab = store.getState().createTab(worktreeId, undefined, undefined, {
        activate: false
      })

      store.setState({
        settings: { ...store.getState().settings!, terminalWindowsShell: 'cmd.exe' }
      })
      const cmdTab = store.getState().createTab(worktreeId, undefined, undefined, {
        activate: false
      })

      return { fallbackTabId: fallbackTab.id, cmdTabId: cmdTab.id }
    })

    const tabSnapshot = await dorkaPage.evaluate(({ fallbackTabId, cmdTabId }) => {
      const state = window.__store!.getState()
      const tabs = Object.values(state.tabsByWorktree).flat()
      return {
        fallbackShell: tabs.find((tab) => tab.id === fallbackTabId)?.shellOverride,
        cmdShell: tabs.find((tab) => tab.id === cmdTabId)?.shellOverride
      }
    }, tabIds)

    expect(tabSnapshot).toEqual({
      fallbackShell: 'powershell.exe',
      cmdShell: 'cmd.exe'
    })

    const fallbackTab = dorkaPage.locator(
      `[data-testid="sortable-tab"][data-tab-id="${tabIds.fallbackTabId}"]`
    )
    const cmdTab = dorkaPage.locator(
      `[data-testid="sortable-tab"][data-tab-id="${tabIds.cmdTabId}"]`
    )
    await expect(fallbackTab).toBeVisible()
    await expect(cmdTab).toBeVisible()

    await expect(fallbackTab.locator('[data-shell-icon]')).toHaveAttribute(
      'data-shell-icon',
      'powershell.exe'
    )
    await expect(cmdTab.locator('[data-shell-icon]')).toHaveAttribute('data-shell-icon', 'cmd.exe')
  })

  test('WSL project tab icons retain runtime ownership across global shell changes', async ({
    dorkaPage
  }) => {
    test.skip(process.platform !== 'win32', 'WSL shell icons require Windows')
    const distro = await getFirstWslDistro(dorkaPage)
    test.skip(!distro, 'WSL icon coverage requires an installed distro')
    await useWslRuntimeForActiveProject(dorkaPage, distro!)

    const tabIds = await dorkaPage.evaluate(async () => {
      const store = window.__store!
      const worktreeId = store.getState().activeWorktreeId!
      const ids: string[] = []
      for (const shell of ['powershell.exe', 'cmd.exe'] as const) {
        await store.getState().updateSettings({ terminalWindowsShell: shell })
        ids.push(
          store.getState().createTab(worktreeId, undefined, undefined, { activate: false }).id
        )
      }
      return ids
    })
    const shells = await dorkaPage.evaluate((ids) => {
      const tabs = Object.values(window.__store!.getState().tabsByWorktree).flat()
      return ids.map((id) => tabs.find((tab) => tab.id === id)?.shellOverride)
    }, tabIds)
    expect(shells).toEqual(['wsl.exe', 'wsl.exe'])
    for (const id of tabIds) {
      const tab = dorkaPage.locator(`[data-testid="sortable-tab"][data-tab-id="${id}"]`)
      await expect(tab).toBeVisible()
      await expect(tab.locator('[data-shell-icon]')).toHaveAttribute('data-shell-icon', 'wsl.exe')
    }
  })
})
