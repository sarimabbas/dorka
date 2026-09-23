// @vitest-environment happy-dom

import { act } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { i18n } from '../../i18n/i18n'
import { PSEUDO_LOCALIZATION_LOCALE } from '../../i18n/pseudo-localization'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  openAutomationsPage: vi.fn(),
  openModal: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyComboDetails: () => [{ keys: ['⌘', 'J'], doubleTap: false }]
}))

import SidebarNav from './SidebarNav'

function setSidebarState(activeView = 'worktrees'): void {
  mocks.state = {
    settings: {
      ...getDefaultSettings('/tmp'),
      showAutomationsButton: false,
      showTasksButton: true,
      showMobileButton: true,
      showArtifactsButton: true,
      showSkillsButton: true,
      experimentalAgentDashboardPopout: false
    },
    activeView,
    openAutomationsPage: mocks.openAutomationsPage,
    openModal: mocks.openModal,
    openSettingsPage: mocks.openSettingsPage,
    openSettingsTarget: mocks.openSettingsTarget
  }
}

function queryButton(container: ParentNode, text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === text
    ) ?? null
  )
}

describe('SidebarNav', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    setSidebarState()
  })

  afterEach(cleanup)

  it('keeps search and Automations while removed product navigation stays absent', () => {
    const { container } = render(<SidebarNav />)

    expect(
      container.querySelector('button[aria-label="Search worktrees and browser tabs"]')
    ).not.toBeNull()
    expect(queryButton(container, 'Agents')).not.toBeNull()
    expect(queryButton(container, 'Computers')).not.toBeNull()
    expect(queryButton(container, 'Automations')).not.toBeNull()
    expect(container.textContent).not.toContain('Tasks')
    expect(container.textContent).not.toContain('Artifacts')
    expect(container.textContent).not.toContain('Skills')
    expect(container.textContent).not.toContain('Dorka Mobile')
    expect(container.textContent).not.toContain('Onboarding checklist')
  })

  it('opens core navigation targets', () => {
    const { container } = render(<SidebarNav />)

    fireEvent.click(
      container.querySelector(
        'button[aria-label="Search worktrees and browser tabs"]'
      ) as HTMLButtonElement
    )
    fireEvent.click(queryButton(container, 'Agents') as HTMLButtonElement)
    fireEvent.click(queryButton(container, 'Computers') as HTMLButtonElement)
    fireEvent.click(queryButton(container, 'Automations') as HTMLButtonElement)

    expect(mocks.openModal).toHaveBeenCalledWith('worktree-palette')
    expect(mocks.openSettingsTarget).toHaveBeenNthCalledWith(1, {
      pane: 'agents',
      repoId: null
    })
    expect(mocks.openSettingsTarget).toHaveBeenNthCalledWith(2, {
      pane: 'computers',
      repoId: null
    })
    expect(mocks.openSettingsPage).toHaveBeenCalledTimes(2)
    expect(mocks.openAutomationsPage).toHaveBeenCalledOnce()
  })

  it('keeps Automations visible and marks it active regardless of the legacy visibility setting', () => {
    setSidebarState('automations')
    const { container } = render(<SidebarNav />)

    expect(queryButton(container, 'Automations')?.getAttribute('aria-current')).toBe('page')
  })

  it('updates labels when pseudo-localization is enabled after mount', async () => {
    const { container } = render(<SidebarNav />)

    await act(async () => {
      await i18n.changeLanguage(PSEUDO_LOCALIZATION_LOCALE)
    })

    expect(queryButton(container, '[Automations]')).not.toBeNull()
  })
})
