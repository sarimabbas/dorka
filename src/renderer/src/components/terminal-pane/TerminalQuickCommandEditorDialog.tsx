import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { TerminalQuickCommand } from '../../../../shared/terminal-quick-command-types'

type TerminalQuickCommandEditorDialogProps = {
  command: TerminalQuickCommand
  hostId: ExecutionHostId
  onOpenChange: (open: boolean) => void
  onSave: (command: TerminalQuickCommand) => void
}

export const TerminalQuickCommandEditorDialog: (
  props: TerminalQuickCommandEditorDialogProps
) => null = () => null
