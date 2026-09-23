import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), 'src/renderer/src', relativePath), 'utf8')
}

describe('Dorka product-surface reachability', () => {
  it('does not mount rejected top-level or setup surfaces', () => {
    const shell = readSource('app-shell/AppWorkspaceShell.tsx')
    const roots = readSource('app-shell/AppRootSurfaces.tsx')
    const layout = readSource('app-shell/use-app-chrome-layout.ts')

    expect(shell).not.toContain('TaskPage')
    expect(shell).not.toContain('MobilePage')
    expect(roots).not.toMatch(/SetupGuide|FeatureWall|OnboardingFlow/)
    expect(layout).toContain("storedActiveView === 'tasks' || storedActiveView === 'mobile'")
  })

  it('does not route rejected global or main-process shortcuts', () => {
    const handlers = readSource('app-shell/app-command-handlers.ts')
    const shortcutBridge = readSource('hooks/ipc-events/workspace-shortcut-ipc-bridge.ts')
    const settingsBridge = readSource('hooks/ipc-events/settings-sidebar-ipc-bridge.ts')

    expect(handlers).not.toMatch(/'view\.tasks'|'workspace\.openBoard'/)
    expect(shortcutBridge).not.toMatch(
      /onOpenTasks|onOpenWorkspaceBoard|onToggleQuickCommandsMenu|TOGGLE_QUICK_COMMANDS_MENU_EVENT/
    )
    expect(settingsBridge).not.toMatch(
      /onOpenSetupGuide|onOpenFeatureTour|subscribeToUnpairedDeviceAuthNotification/
    )
  })

  it('keeps the worktree palette search-only', () => {
    const localState = readSource('components/use-worktree-jump-palette-local-state.ts')
    const projectTargets = readSource('components/use-worktree-jump-palette-project-targets.ts')
    const surface = readSource('components/worktree-jump-palette-surface.tsx')

    expect(localState).toContain('const showCreateAction = false')
    expect(localState).not.toMatch(/parseCmdJTaskSourceUrl|getWorktreePaletteCreateActionState/)
    expect(projectTargets).not.toMatch(
      /buildCmdJActionResults|buildCmdJSettingsResults|getCmdJQuickActions|buildPluginQuickActions/
    )
    expect(surface).toContain('Search chats, terminals, worktrees, and open tabs')
    expect(surface).not.toContain('settings, and actions')
  })
})
