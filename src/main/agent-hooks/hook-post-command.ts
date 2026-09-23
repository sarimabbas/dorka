import type { AgentHookSource } from '../../shared/agent-hook-relay'
import { DORKA_HOOK_RAW_JSON_TRANSPORT } from '../../shared/agent-hook-types'

export function buildPosixAgentHookPostCommand(
  source: AgentHookSource,
  options: { curlCommand?: string; indent?: string } = {}
): string[] {
  const curlCommand = options.curlCommand ?? 'curl'
  const indent = options.indent ?? '  '
  return [
    `if [ "\${DORKA_AGENT_HOOK_TRANSPORT:-}" = "${DORKA_HOOK_RAW_JSON_TRANSPORT}" ] && command -v base64 >/dev/null 2>&1 && command -v tr >/dev/null 2>&1; then`,
    `  dorka_hook_metadata=$(printf '%s\\037%s\\037%s\\037%s\\037%s\\037%s' "$DORKA_PANE_KEY" "$DORKA_TAB_ID" "$DORKA_AGENT_LAUNCH_TOKEN" "$DORKA_WORKTREE_ID" "$DORKA_AGENT_HOOK_ENV" "$DORKA_AGENT_HOOK_VERSION" | base64 | tr -d '\\n') && \\`,
    `  [ -n "$dorka_hook_metadata" ] && \\`,
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST "http://127.0.0.1:\${DORKA_AGENT_HOOK_PORT}/hook/${source}" \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/json" \\`,
    `  ${indent}-H "X-Dorka-Agent-Hook-Token: \${DORKA_AGENT_HOOK_TOKEN}" \\`,
    `  ${indent}-H "X-Dorka-Agent-Hook-Meta-Encoding: base64" \\`,
    `  ${indent}-H "X-Dorka-Agent-Hook-Meta: \${dorka_hook_metadata}" \\`,
    `  ${indent}--data-binary @-`,
    'else',
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST "http://127.0.0.1:\${DORKA_AGENT_HOOK_PORT}/hook/${source}" \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/x-www-form-urlencoded" \\`,
    `  ${indent}-H "X-Dorka-Agent-Hook-Token: \${DORKA_AGENT_HOOK_TOKEN}" \\`,
    `  ${indent}--data-urlencode "paneKey=\${DORKA_PANE_KEY}" \\`,
    `  ${indent}--data-urlencode "tabId=\${DORKA_TAB_ID}" \\`,
    `  ${indent}--data-urlencode "launchToken=\${DORKA_AGENT_LAUNCH_TOKEN}" \\`,
    `  ${indent}--data-urlencode "worktreeId=\${DORKA_WORKTREE_ID}" \\`,
    `  ${indent}--data-urlencode "env=\${DORKA_AGENT_HOOK_ENV}" \\`,
    `  ${indent}--data-urlencode "version=\${DORKA_AGENT_HOOK_VERSION}" \\`,
    `  ${indent}--data-urlencode "payload@-"`,
    'fi'
  ]
}
