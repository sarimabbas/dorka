import {
  ACCOUNT_IMPORT_RUNTIME_CAPABILITY,
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  CODEX_RESET_CREDIT_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import { STATUS_METHODS } from './status'
import { AI_VAULT_METHODS } from './ai-vault'
import { AUTOMATION_METHODS } from './automations'
import { REPO_METHODS } from './repo'
import { WORKTREE_METHODS } from './worktree'
import { TERMINAL_METHODS } from './terminal'
import { TERMINAL_ORPHAN_METHODS } from './terminal-orphan'
import { BROWSER_CORE_METHODS } from './browser-core'
import { BROWSER_IDENTITY_METHODS } from './browser-identity-rpc'
import { BROWSER_EXTRA_METHODS } from './browser-extras'
import { BROWSER_SCREENCAST_METHODS } from './browser-screencast'
import { BROWSER_CLIENT_HOST_METHODS } from './browser-client-host'
import { BROWSER_CLIENT_FILE_CHANNEL_METHODS } from './browser-client-file-channel'
import { BROWSER_NETWORK_TUNNEL_METHODS } from './browser-network-tunnel'
import { ORCHESTRATION_METHODS } from './orchestration'
import { NOTIFICATION_METHODS } from './notifications'
import { STATS_METHODS } from './stats'
import { DIAGNOSTICS_METHODS } from './diagnostics'
import { PREFLIGHT_METHODS } from './preflight'
import { COMPUTER_METHODS } from './computer'
import { SESSION_TAB_METHODS } from './session-tabs'
import { NATIVE_CHAT_METHODS } from './native-chat'
import { FILE_METHODS } from './files'
import { GIT_METHODS } from './git'
import { GITHUB_METHODS } from './github'
import { GITLAB_METHODS } from './gitlab'
import { HOSTED_REVIEW_METHODS } from './hosted-review'
import { LINEAR_METHODS } from './linear'
import { LINEAR_AGENT_ACCESS_METHODS } from './linear-agent-access'
import { JIRA_METHODS } from './jira'
import { SSH_METHODS } from './ssh'
import { SPEECH_METHODS } from './speech'
import { CLIENT_UI_METHODS } from './client-ui'
import { CLIENT_EVENT_METHODS } from './client-events'
import { WORKSPACE_PORT_METHODS } from './workspace-ports'
import { SKILL_METHODS } from './skills'
import { CLIPBOARD_METHODS } from './clipboard'
import { HOST_CAPABILITY_METHODS } from './host-capabilities'
import { MOBILE_WEB_BUNDLE_METHODS } from './mobile-web-bundle'
import { RUNTIME_CLIENT_CAPABILITY_METHODS } from './runtime-client-capabilities'
import { EMULATOR_METHODS } from './emulator'
import { PAIRING_METHODS } from './pairing'
import { UPDATER_METHODS } from './updater'
import { AGENT_SESSION_METHODS } from './agent-session'
import { STRUCTURED_AGENT_SESSION_METHODS } from './structured-agent-session'
import { AGENT_HOOK_METHODS } from './agent-hooks'
import { AGENT_LAUNCH_METHODS } from './agent-launch'
import { AGENT_ROSTER_METHODS } from './agent-roster'
import { COMPUTER_LIFECYCLE_METHODS } from './computer-lifecycle'

// Dorkad does not configure artifact, account, or plugin services. Keeping those declarations
// out of this module also keeps their implementation graphs out of the Node-only bundle.
export const DORKAD_DISABLED_RUNTIME_CAPABILITIES = [
  ACCOUNT_IMPORT_RUNTIME_CAPABILITY,
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  CODEX_RESET_CREDIT_RUNTIME_CAPABILITY
] as const

export const DORKAD_RPC_METHOD_GROUPS = {
  beforeArtifacts: [...STATUS_METHODS, ...AGENT_HOOK_METHODS, ...AI_VAULT_METHODS],
  beforeAccounts: [
    ...AUTOMATION_METHODS,
    ...REPO_METHODS,
    ...WORKTREE_METHODS,
    ...AGENT_SESSION_METHODS,
    ...STRUCTURED_AGENT_SESSION_METHODS,
    ...AGENT_LAUNCH_METHODS,
    ...AGENT_ROSTER_METHODS,
    ...COMPUTER_LIFECYCLE_METHODS,
    ...TERMINAL_METHODS,
    ...TERMINAL_ORPHAN_METHODS,
    ...BROWSER_CORE_METHODS,
    ...BROWSER_IDENTITY_METHODS,
    ...BROWSER_SCREENCAST_METHODS,
    ...BROWSER_EXTRA_METHODS,
    ...BROWSER_CLIENT_HOST_METHODS,
    ...BROWSER_CLIENT_FILE_CHANNEL_METHODS,
    ...BROWSER_NETWORK_TUNNEL_METHODS,
    ...ORCHESTRATION_METHODS,
    ...NOTIFICATION_METHODS,
    ...STATS_METHODS,
    ...DIAGNOSTICS_METHODS
  ],
  beforePlugins: [
    ...PREFLIGHT_METHODS,
    ...COMPUTER_METHODS,
    ...SESSION_TAB_METHODS,
    ...NATIVE_CHAT_METHODS,
    ...FILE_METHODS,
    ...GIT_METHODS,
    ...GITHUB_METHODS,
    ...GITLAB_METHODS,
    ...HOSTED_REVIEW_METHODS,
    ...LINEAR_METHODS,
    ...LINEAR_AGENT_ACCESS_METHODS,
    ...JIRA_METHODS,
    ...SSH_METHODS,
    ...SPEECH_METHODS,
    ...WORKSPACE_PORT_METHODS
  ],
  afterPlugins: [
    ...SKILL_METHODS,
    ...CLIPBOARD_METHODS,
    ...HOST_CAPABILITY_METHODS,
    ...MOBILE_WEB_BUNDLE_METHODS,
    ...RUNTIME_CLIENT_CAPABILITY_METHODS,
    ...CLIENT_EVENT_METHODS,
    ...CLIENT_UI_METHODS,
    ...EMULATOR_METHODS,
    ...PAIRING_METHODS,
    ...UPDATER_METHODS
  ]
} as const

export const DORKAD_RPC_METHODS = [
  ...DORKAD_RPC_METHOD_GROUPS.beforeArtifacts,
  ...DORKAD_RPC_METHOD_GROUPS.beforeAccounts,
  ...DORKAD_RPC_METHOD_GROUPS.beforePlugins,
  ...DORKAD_RPC_METHOD_GROUPS.afterPlugins
]
