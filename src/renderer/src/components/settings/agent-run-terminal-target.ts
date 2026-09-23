import type { Run } from '../../../../shared/agent-roster'
import { parseRemoteRuntimePtyId } from '../../../../shared/remote-runtime-pty-id'
import type { TerminalLayoutSnapshot, TerminalTab } from '../../../../shared/terminal-tab-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

export type AgentRunTerminalTarget = {
  worktreeId: string
  tabId: string
  leafId: string | null
}

type AgentRunTerminalState = {
  tabsByWorktree: Record<string, TerminalTab[] | undefined>
  terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot | undefined>
}

function matchesRunTerminal(run: Run, target: RuntimeClientTarget, ptyId: string): boolean {
  const remote = parseRemoteRuntimePtyId(ptyId)
  if (target.kind === 'environment') {
    return (
      remote !== null &&
      remote.handle === run.terminalSessionId &&
      (remote.environmentId === null || remote.environmentId === target.environmentId)
    )
  }
  return (
    remote === null &&
    (ptyId === run.terminalSessionId || run.processIdentity?.startsWith(`${ptyId}:`) === true)
  )
}

export function findAgentRunTerminalTarget(
  state: AgentRunTerminalState,
  run: Run,
  target: RuntimeClientTarget
): AgentRunTerminalTarget | null {
  if (!run.terminalSessionId) {
    return null
  }
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    for (const tab of tabs ?? []) {
      const layout = state.terminalLayoutsByTabId[tab.id]
      const leaf = Object.entries(layout?.ptyIdsByLeafId ?? {}).find(([, ptyId]) =>
        matchesRunTerminal(run, target, ptyId)
      )
      if (leaf) {
        return { worktreeId, tabId: tab.id, leafId: leaf[0] }
      }
      if (tab.ptyId && matchesRunTerminal(run, target, tab.ptyId)) {
        return { worktreeId, tabId: tab.id, leafId: layout?.activeLeafId ?? null }
      }
    }
  }
  return null
}
