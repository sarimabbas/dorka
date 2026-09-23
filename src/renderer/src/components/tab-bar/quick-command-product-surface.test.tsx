import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TabBarQuickCommandsButton } from './TabBarQuickCommandsButton'
import { TerminalQuickCommandEditorDialog } from '../terminal-pane/TerminalQuickCommandEditorDialog'
import { TerminalQuickCommandsSubmenu } from '../terminal-pane/TerminalQuickCommandsSubmenu'

const command = {
  id: 'review',
  label: 'Review',
  command: 'review',
  appendEnter: true
}

describe('quick-command product surfaces', () => {
  it('omits the tab-bar command button', () => {
    expect(
      renderToStaticMarkup(
        <TabBarQuickCommandsButton worktreeId="repo:worktree" groupId="group-1" />
      )
    ).toBe('')
  })

  it('omits terminal quick-command menus and dialogs', () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    const onRun = vi.fn()
    const onOpenChange = vi.fn()
    const onSave = vi.fn()

    const menu = renderToStaticMarkup(
      <TerminalQuickCommandsSubmenu
        hosts={[
          {
            hostId: 'local',
            label: 'Local',
            repoCommands: [command],
            globalCommands: []
          }
        ]}
        hostLoadFailed={false}
        hostOwnershipPending={false}
        repoLabel="Dorka"
        onAdd={onAdd}
        onClose={onClose}
        onRun={onRun}
      />
    )
    const dialog = renderToStaticMarkup(
      <TerminalQuickCommandEditorDialog
        command={command}
        hostId="local"
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    )

    expect(menu).toBe('')
    expect(dialog).toBe('')
    expect(onAdd).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onRun).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
