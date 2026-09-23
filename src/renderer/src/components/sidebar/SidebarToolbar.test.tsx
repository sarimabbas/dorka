// @vitest-environment happy-dom

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SidebarToolbar from './SidebarToolbar'

vi.mock('./ScrollToCurrentWorkspaceToolbarButton', () => ({
  ScrollToCurrentWorkspaceToolbarButton: () => <button type="button">Current workspace</button>
}))

vi.mock('./SidebarSettingsHelpMenu', () => ({
  SidebarSettingsHelpMenu: () => <button type="button">Settings</button>
}))

describe('SidebarToolbar', () => {
  it('keeps Settings and workspace navigation without a Kanban entry', () => {
    const { container } = render(<SidebarToolbar />)

    expect(container.textContent).toContain('Settings')
    expect(container.textContent).toContain('Current workspace')
    expect(container.textContent).not.toContain('Workspace board')
    expect(container.querySelector('[data-workspace-board-trigger]')).toBeNull()
  })
})
