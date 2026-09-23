import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TerminalContextMenu from './TerminalContextMenu'
import { translate } from '@/i18n/i18n'
import type { KeybindingOverrides } from '../../../../shared/keybindings'

type ItemProps = { onSelect?: () => void; children?: React.ReactNode }

const items = vi.hoisted(() => ({ list: [] as ItemProps[] }))
const shortcuts = vi.hoisted(() => ({ list: [] as string[] }))

vi.mock('@/components/ui/dropdown-menu', async () => {
  const React_ = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement(React_.Fragment, null, children)
  const OpenContext = React_.createContext(false)
  return {
    DropdownMenu: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      React_.createElement(OpenContext.Provider, { value: open }, children),
    DropdownMenuContent: ({ children }: { children?: React.ReactNode }) =>
      React_.useContext(OpenContext) ? passthrough({ children }) : null,
    DropdownMenuLabel: passthrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuShortcut: ({ children }: { children?: React.ReactNode }) => {
      shortcuts.list.push(
        React_.Children.toArray(children)
          .filter((child): child is string => typeof child === 'string')
          .join('')
      )
      return React_.createElement(React_.Fragment, null, children)
    },
    DropdownMenuSub: passthrough,
    DropdownMenuSubContent: passthrough,
    DropdownMenuSubTrigger: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuItem: (props: ItemProps) => {
      items.list.push(props)
      return React.createElement(React.Fragment, null, props.children)
    }
  }
})
vi.mock('@/i18n/i18n', () => ({ translate: vi.fn((_key: string, fallback: string) => fallback) }))
vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => null }))
vi.mock('./terminal-context-menu-dismiss', () => ({
  shouldIgnoreTerminalMenuPointerDownOutside: () => false
}))

function childrenText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string') {
        return child
      }
      return React.isValidElement<{ children?: React.ReactNode }>(child)
        ? childrenText(child.props.children)
        : ''
    })
    .join('')
}

function renderMenu(overrides: Record<string, unknown> = {}): string {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    menuPoint: { x: 0, y: 0 },
    menuOpenedAtRef: { current: 0 },
    canClosePane: true,
    canExpandPane: true,
    menuPaneIsExpanded: false,
    onCopy: vi.fn(),
    onSelectAll: vi.fn(),
    onPaste: vi.fn(),
    onSplitRight: vi.fn(),
    onSplitDown: vi.fn(),
    keybindings: {},
    canEqualizePaneSizes: false,
    onEqualizePaneSizes: vi.fn(),
    onClosePane: vi.fn(),
    onClearScreen: vi.fn(),
    canContinueAgentSessionInNewSession: false,
    onContinueAgentSessionInNewSession: vi.fn(),
    onForkAgentSession: vi.fn(),
    canToggleNativeChat: false,
    isNativeChatView: false,
    onToggleNativeChat: vi.fn(),
    onCopyAgentSessionContext: vi.fn(),
    quickCommandHosts: [
      { hostId: 'local' as const, label: 'Local Linux', repoCommands: [], globalCommands: [] }
    ],
    quickCommandHostLoadFailed: false,
    quickCommandHostOwnershipPending: false,
    quickCommandRepoLabel: 'Dorka',
    onQuickCommand: vi.fn(),
    onAddQuickCommand: vi.fn(),
    onToggleExpand: vi.fn(),
    onSetTitle: vi.fn(),
    onClearPaneTitle: vi.fn(),
    canClearPaneTitle: false,
    onCopyTerminalId: vi.fn(),
    onCopyPaneId: vi.fn(),
    canCopyAgentSessionId: false,
    onCopyAgentSessionId: vi.fn(),
    ...overrides
  }
  return renderToStaticMarkup(React.createElement(TerminalContextMenu, props))
}

describe('TerminalContextMenu', () => {
  beforeEach(() => {
    vi.mocked(translate).mockClear()
    items.list = []
    shortcuts.list = []
    vi.stubGlobal('navigator', { userAgent: 'Linux' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does no menu-copy work while closed, then builds the opened menu', () => {
    renderMenu({ open: false })
    expect(translate).not.toHaveBeenCalled()
    expect(items.list).toHaveLength(0)

    renderMenu()
    expect(translate).toHaveBeenCalled()
    expect(items.list.length).toBeGreaterThan(0)
  })

  it('renders a "Copy Context" item that triggers onCopyAgentSessionContext (issue #5020)', () => {
    const onCopyAgentSessionContext = vi.fn()
    const onForkAgentSession = vi.fn()
    renderMenu({ onCopyAgentSessionContext, onForkAgentSession })

    const copyContextItem = items.list.find(
      (item) => childrenText(item.children) === 'Copy Context'
    )
    expect(copyContextItem).toBeDefined()

    copyContextItem?.onSelect?.()
    expect(onCopyAgentSessionContext).toHaveBeenCalledTimes(1)
    // Why: copying context must not go through the fork dialog path.
    expect(onForkAgentSession).not.toHaveBeenCalled()
  })

  it('shows new-session continuation only for eligible agent panes', () => {
    const onContinueAgentSessionInNewSession = vi.fn()
    renderMenu({
      canContinueAgentSessionInNewSession: true,
      onContinueAgentSessionInNewSession
    })

    const handoffItem = items.list.find(
      (item) => childrenText(item.children) === 'Continue in New Session…'
    )
    expect(handoffItem).toBeDefined()

    handoffItem?.onSelect?.()
    expect(onContinueAgentSessionInNewSession).toHaveBeenCalledTimes(1)
  })

  it('does not expose a native/terminal view switch in the terminal menu', () => {
    renderMenu()

    expect(items.list.some((item) => childrenText(item.children).includes('Switch to'))).toBe(false)
  })

  it('shows Copy Session ID only for panes with provider identity', () => {
    const onCopyAgentSessionId = vi.fn()
    renderMenu({ canCopyAgentSessionId: true, onCopyAgentSessionId })

    const item = items.list.find(
      (candidate) => childrenText(candidate.children) === 'Copy Session ID'
    )
    expect(item).toBeDefined()
    expect(
      items.list
        .map((candidate) => childrenText(candidate.children))
        .filter((label) => ['Copy Session ID', 'Copy Terminal ID', 'Copy Pane ID'].includes(label))
    ).toEqual(['Copy Session ID', 'Copy Terminal ID', 'Copy Pane ID'])
    item?.onSelect?.()
    expect(onCopyAgentSessionId).toHaveBeenCalledTimes(1)

    vi.mocked(translate).mockClear()
    items.list = []
    renderMenu({ canCopyAgentSessionId: false })
    expect(
      items.list.some((candidate) => childrenText(candidate.children) === 'Copy Session ID')
    ).toBe(false)
  })

  it('shows one shortcut per terminal menu action on Windows', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    })
    const keybindings = {
      'terminal.copySelection': ['Ctrl+Shift+C', 'Ctrl+Insert', 'Ctrl+C'],
      'terminal.selectAll': ['Ctrl+Shift+A'],
      'terminal.splitRight': ['Mod+Shift+D', 'Alt+Shift+Right'],
      'terminal.splitDown': ['Alt+Shift+D', 'Mod+Shift+Minus']
    } satisfies KeybindingOverrides

    renderMenu({ keybindings })

    expect(shortcuts.list).toContain('Ctrl+Shift+C')
    expect(shortcuts.list).toContain('Ctrl+Shift+A')
    expect(shortcuts.list).toContain('Ctrl+V')
    expect(shortcuts.list).toContain('Ctrl+Shift+D')
    expect(shortcuts.list).toContain('Alt+Shift+D')
    expect(shortcuts.list.some((shortcut) => shortcut.includes(','))).toBe(false)
  })

  it('does not expose quick-command actions', () => {
    const onQuickCommand = vi.fn()
    const onAddQuickCommand = vi.fn()
    const rendered = renderMenu({
      onQuickCommand,
      onAddQuickCommand,
      quickCommandHosts: [
        {
          hostId: 'local',
          label: 'Local Mac',
          repoCommands: [],
          globalCommands: [
            {
              id: 'review',
              label: 'Review',
              command: 'review',
              appendEnter: true
            }
          ]
        }
      ]
    })

    expect(rendered).not.toContain('Quick Commands')
    expect(rendered).not.toContain('Review')
    expect(rendered).not.toContain('Add Quick Command')
    expect(onQuickCommand).not.toHaveBeenCalled()
    expect(onAddQuickCommand).not.toHaveBeenCalled()
  })
})
