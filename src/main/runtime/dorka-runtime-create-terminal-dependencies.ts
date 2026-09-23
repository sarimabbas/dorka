import type { TerminalCreateOptions } from './runtime-terminal-contracts'
import type { RuntimePtyController } from './runtime-pty-controller-contract'
import { isValidHostTerminalTabId } from '../../shared/terminal-tab-id'
import { isTerminalLeafId, makePaneKey } from '../../shared/stable-pane-id'

export type { TerminalCreateOptions } from './runtime-terminal-contracts'
export type { TerminalWorkspaceLaunchScope } from './runtime-legacy-worker-terminal-recovery-types'
export type { RuntimeTerminalCreate } from '../../shared/runtime-types'

export function assertStartupAgentHasWorkspaceSelector(
  opts: TerminalCreateOptions,
  selector: string | undefined
): void {
  if (opts.startupAgent && selector === undefined) {
    throw new Error(`startupAgent ${opts.startupAgent} requires a workspace selector.`)
  }
}

export function assertRuntimePtySpawnAvailable(
  controller: RuntimePtyController | null | undefined
): void {
  if (!controller?.spawn) {
    throw new Error('runtime_unavailable')
  }
}

export function canAdoptTerminalPaneIdentity(tabId?: string, leafId?: string): boolean {
  return Boolean(tabId && isValidHostTerminalTabId(tabId) && leafId && isTerminalLeafId(leafId))
}

export function shouldCreateTerminalInBackground(
  opts: TerminalCreateOptions,
  hasWorkspaceSelector: boolean,
  hasAuthoritativeWindow: boolean
): boolean {
  const requiresRendererFocus = opts.presentation === 'focused' || opts.focus === true
  return (
    hasWorkspaceSelector &&
    (Boolean(opts.agentSessionClaim) ||
      (!requiresRendererFocus && opts.rendererBacked !== true) ||
      !hasAuthoritativeWindow)
  )
}
export {
  createTerminalRevealWarning,
  ownerSurfacing,
  resolveTerminalPresentation
} from './dorka-runtime-core'
export { isValidHostTerminalTabId, isTerminalLeafId, makePaneKey }
export { randomUUID } from 'node:crypto'
export {
  copySleepingAgentLaunchConfig,
  inferCapturedClaudeAgentTeamsMode,
  mergeTerminalEnvDeletionKeys
} from './runtime-agent-launch-resolution'
export { buildClaudeAgentTeamsLaunchPlan } from './claude-agent-teams-shim-env'
export {
  addClaudeTeammateModeAuto,
  addClaudeTeammateModeInProcess
} from '../../shared/claude-agent-teams-tmux-compat'
export { SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV } from '../../shared/setup-agent-sequencing'
export { getTerminalViewColorQueryReplyColors } from './terminal-view-attribute-store'
export type { RuntimePtyController } from './runtime-pty-controller-contract'
export { agentSessionPtyWriteGate } from './agent-session-pty-write-gate'
export { getRuntimeDesktopSurface } from './runtime-desktop-surface'
export type { IpcMainEvent } from 'electron'
