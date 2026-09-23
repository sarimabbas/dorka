import { describe, expect, it } from 'vitest'
import { pickRemoteCliEnv } from './remote-cli-env'

describe('pickRemoteCliEnv', () => {
  it('forwards SSH Dorka terminal and worktree context for remote CLI calls', () => {
    expect(
      pickRemoteCliEnv({
        DORKA_TERMINAL_HANDLE: 'term_ssh',
        DORKA_WORKTREE_ID: 'repo::remote',
        DORKA_PANE_KEY: 'pane-1',
        DORKA_AGENT_LAUNCH_TOKEN: 'launch-secret',
        DORKA_WORKSPACE_ID: 'workspace-1',
        DORKA_USER_DATA_PATH: '/tmp/dorka',
        PATH: '/usr/bin',
        SECRET_TOKEN: 'nope'
      })
    ).toEqual({
      DORKA_TERMINAL_HANDLE: 'term_ssh',
      DORKA_WORKTREE_ID: 'repo::remote',
      DORKA_PANE_KEY: 'pane-1',
      DORKA_AGENT_LAUNCH_TOKEN: 'launch-secret',
      DORKA_WORKSPACE_ID: 'workspace-1',
      DORKA_USER_DATA_PATH: '/tmp/dorka',
      PATH: '/usr/bin'
    })
  })
})
