export function pickRemoteCliEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const picked: Record<string, string> = {}
  for (const key of [
    'DORKA_TERMINAL_HANDLE',
    'DORKA_WORKTREE_ID',
    'DORKA_PANE_KEY',
    'DORKA_AGENT_LAUNCH_TOKEN',
    'DORKA_WORKSPACE_ID',
    'DORKA_USER_DATA_PATH',
    'PATH',
    'Path'
  ]) {
    const value = env[key]
    if (typeof value === 'string') {
      picked[key] = value
    }
  }
  return picked
}
