import type { TerminalQuickCommand } from '../../../../shared/terminal-quick-command-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { TerminalQuickCommandMenuHost } from '@/hooks/use-terminal-quick-command-hosts'

type TerminalQuickCommandsSubmenuProps = {
  hosts: TerminalQuickCommandMenuHost[]
  hostLoadFailed: boolean
  hostOwnershipPending: boolean
  repoLabel: string | null
  onAdd: (hostId: ExecutionHostId) => void
  onClose: () => void
  onRun: (command: TerminalQuickCommand, historyId: string) => void
}

export const TerminalQuickCommandsSubmenu: (
  props: TerminalQuickCommandsSubmenuProps
) => null = () => null
