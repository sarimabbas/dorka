import { describe, expect, it } from 'vitest'
import { isAbsolute } from 'node:path'
import { getShellReadyWrapperRoot } from '../providers/local-pty-shell-ready-wrapper-root'
import {
  SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV,
  SETUP_AGENT_SEQUENCE_STARTUP_SCRIPT_ENV
} from '../../shared/setup-agent-sequencing'
import { addDorkaWslInteropEnv, stampWslOrchestrationCompatibilityHost } from './wsl-dorka-env'

describe('addDorkaWslInteropEnv', () => {
  it('marks the Dorka terminal handle for Windows to WSL env import', () => {
    const env: Record<string, string> = { DORKA_TERMINAL_HANDLE: 'term_wsl' }

    addDorkaWslInteropEnv(env)

    expect(env.WSLENV).toBe('DORKA_TERMINAL_HANDLE/u:DORKA_SHELL_READY_ROOT/p')
  })

  // Why this is published at all: the wrapper tree is content-addressed, so the
  // in-guest login script cannot rebuild its path from DORKA_USER_DATA_PATH -- it
  // cannot derive the hash segment. Without this the guest finds no wrapper and
  // every WSL pane launches unwrapped: no ready marker, so every startup command
  // waits out the full readiness timeout.
  it('publishes the resolved wrapper root path-translated for the guest', () => {
    const env: Record<string, string> = {}

    addDorkaWslInteropEnv(env)

    expect(env.DORKA_SHELL_READY_ROOT).toBe(getShellReadyWrapperRoot())
    expect(isAbsolute(env.DORKA_SHELL_READY_ROOT as string)).toBe(true)
    // /p, not /u: the guest reads a Windows path through /mnt/c.
    expect(env.WSLENV?.split(':')).toContain('DORKA_SHELL_READY_ROOT/p')
  })

  it('imports setup-gated startup env into WSL without path translation', () => {
    const env: Record<string, string> = {
      [SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV]: 'codex',
      [SETUP_AGENT_SEQUENCE_STARTUP_SCRIPT_ENV]: 'while :; do sleep 1; done'
    }

    addDorkaWslInteropEnv(env)

    expect(env.WSLENV?.split(':')).toEqual([
      'DORKA_SHELL_READY_ROOT/p',
      `${SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV}/u`,
      `${SETUP_AGENT_SEQUENCE_STARTUP_SCRIPT_ENV}/u`
    ])
  })

  it('preserves existing WSLENV entries and does not duplicate the handle entry', () => {
    const env: Record<string, string> = {
      WSLENV: 'FOO/u:DORKA_TERMINAL_HANDLE/u:BAR/p'
    }

    addDorkaWslInteropEnv(env)

    expect(env.WSLENV).toBe('FOO/u:DORKA_TERMINAL_HANDLE/u:BAR/p:DORKA_SHELL_READY_ROOT/p')
  })

  it('marks OMP status and hook env for Windows to WSL import', () => {
    const env: Record<string, string> = {
      DORKA_TERMINAL_HANDLE: 'term_wsl',
      DORKA_USER_DATA_PATH: 'C:\\Users\\jin\\AppData\\Roaming\\Dorka',
      DORKA_CLI_COMMAND: 'dorka-ide',
      DORKA_CODEX_LAUNCH_PREFLIGHT: 'C:\\Program Files\\Dorka\\resources\\bin\\dorka.exe',
      DORKA_OMP_FRESH_CONFIG: 'C:\\Dorka\\fresh-session.yml',
      DORKA_OMP_STATUS_EXTENSION: 'C:\\Users\\jin\\.omp\\agent\\extensions\\dorka-agent-status.ts',
      DORKA_PRIME_AGENT_STATUS_EXTENSION: 'C:\\stale\\dorka-agent-status.ts',
      DORKA_PANE_KEY: 'tab-1:leaf-1',
      DORKA_TAB_ID: 'tab-1',
      DORKA_WORKTREE_ID: 'repo::\\\\wsl.localhost\\Ubuntu\\home\\jin\\repo',
      DORKA_AGENT_LAUNCH_TOKEN: 'launch-secret',
      DORKA_OPENCODE_AGENT: 'opencode2',
      DORKA_AGENT_HOOK_PORT: '4567',
      DORKA_AGENT_HOOK_TOKEN: 'token',
      DORKA_AGENT_HOOK_ENV: 'dev',
      DORKA_AGENT_HOOK_VERSION: '1',
      DORKA_AGENT_HOOK_TRANSPORT: 'raw-json-v1',
      DORKA_WSL_HOOK_INSTANCE: 'testinstance',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_KIND: 'wsl',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_ID: 'local',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION: 'Ubuntu'
    }

    addDorkaWslInteropEnv(env)

    expect(env.WSLENV).toContain('DORKA_TERMINAL_HANDLE/u')
    expect(env.WSLENV).toContain('DORKA_USER_DATA_PATH/p')
    expect(env.WSLENV).toContain('DORKA_CLI_COMMAND/u')
    expect(env.WSLENV).toContain('DORKA_CODEX_LAUNCH_PREFLIGHT/p')
    expect(env.WSLENV).toContain('DORKA_OMP_STATUS_EXTENSION/p')
    expect(env.WSLENV).toContain('DORKA_OMP_FRESH_CONFIG/p')
    expect(env.WSLENV).not.toContain('DORKA_PRIME_AGENT_STATUS_EXTENSION')
    expect(env.WSLENV).toContain('DORKA_PANE_KEY/u')
    expect(env.WSLENV).toContain('DORKA_TAB_ID/u')
    expect(env.WSLENV).toContain('DORKA_WORKTREE_ID/u')
    expect(env.WSLENV).toContain('DORKA_AGENT_LAUNCH_TOKEN/u')
    expect(env.WSLENV).toContain('DORKA_OPENCODE_AGENT/u')
    expect(env.WSLENV).toContain('DORKA_AGENT_HOOK_PORT/u')
    expect(env.WSLENV).toContain('DORKA_AGENT_HOOK_TOKEN/u')
    expect(env.WSLENV).toContain('DORKA_AGENT_HOOK_ENV/u')
    expect(env.WSLENV).toContain('DORKA_AGENT_HOOK_VERSION/u')
    expect(env.WSLENV).toContain('DORKA_AGENT_HOOK_TRANSPORT/u')
    expect(env.WSLENV).toContain('DORKA_WSL_HOOK_INSTANCE/u')
    expect(env.WSLENV).toContain('DORKA_ORCHESTRATION_COMPATIBILITY_HOST_KIND/u')
    expect(env.WSLENV).toContain('DORKA_ORCHESTRATION_COMPATIBILITY_HOST_ID/u')
    expect(env.WSLENV).toContain('DORKA_ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION/u')
  })

  it('overwrites caller host evidence with native runtime WSL authority', () => {
    const env = {
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_KIND: 'ssh',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_ID: 'caller-host',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION: 'caller-incarnation',
      DORKA_ORCHESTRATION_COMPATIBILITY_ATTACHMENT: 'caller-attachment'
    }

    stampWslOrchestrationCompatibilityHost(env, 'local', 'Ubuntu')

    expect(env).toEqual({
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_KIND: 'wsl',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_ID: 'local',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION: 'Ubuntu'
    })
  })

  it('clears inherited host evidence outside a runtime-owned WSL scope', () => {
    const env = {
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_KIND: 'ssh',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_ID: 'caller-host',
      DORKA_ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION: 'caller-incarnation',
      DORKA_ORCHESTRATION_COMPATIBILITY_ATTACHMENT: 'caller-attachment'
    }

    stampWslOrchestrationCompatibilityHost(env, 'local', null)

    expect(env).toEqual({})
  })

  it('path-translates a Windows hook endpoint but passes a guest-side one untouched', () => {
    const windowsEnv: Record<string, string> = {
      DORKA_AGENT_HOOK_ENDPOINT: 'C:\\Users\\jin\\AppData\\Roaming\\Dorka\\agent-hooks\\endpoint.cmd'
    }
    addDorkaWslInteropEnv(windowsEnv)
    expect(windowsEnv.WSLENV).toContain('DORKA_AGENT_HOOK_ENDPOINT/p')

    const guestEnv: Record<string, string> = {
      DORKA_AGENT_HOOK_ENDPOINT: '/home/jin/.dorka-wsl/agent-hooks/port-4567/endpoint.env'
    }
    addDorkaWslInteropEnv(guestEnv)
    expect(guestEnv.WSLENV).toContain('DORKA_AGENT_HOOK_ENDPOINT/u')
    expect(guestEnv.WSLENV).not.toContain('DORKA_AGENT_HOOK_ENDPOINT/p')
  })

  it('tags pre-translated Linux setup paths /u so WSLENV does not translate them again (#9206)', () => {
    const env: Record<string, string> = {
      DORKA_ROOT_PATH: '/home/jin/repo',
      DORKA_WORKTREE_PATH: '/home/jin/repo-worktrees/fix-1',
      DORKA_WORKSPACE_NAME: 'fix-1',
      CONDUCTOR_ROOT_PATH: '/home/jin/repo',
      GHOSTX_ROOT_PATH: '/home/jin/repo'
    }

    addDorkaWslInteropEnv(env)

    // /u (not /p): hooks.ts already converted these to Linux paths before
    // spawn, so a /p flag would make WSLENV double-translate them.
    expect(env.WSLENV).toContain('DORKA_ROOT_PATH/u')
    expect(env.WSLENV).toContain('DORKA_WORKTREE_PATH/u')
    expect(env.WSLENV).toContain('CONDUCTOR_ROOT_PATH/u')
    expect(env.WSLENV).toContain('GHOSTX_ROOT_PATH/u')
    expect(env.WSLENV).not.toContain('DORKA_ROOT_PATH/p')
    expect(env.WSLENV).not.toContain('DORKA_WORKTREE_PATH/p')
    // The value itself must stay the already-Linux path.
    expect(env.DORKA_ROOT_PATH).toBe('/home/jin/repo')
    expect(env.DORKA_WORKTREE_PATH).toBe('/home/jin/repo-worktrees/fix-1')
  })

  it('tags untranslated Windows setup paths /p so WSLENV translates them (wsl.exe shell over a Windows worktree)', () => {
    const env: Record<string, string> = {
      DORKA_ROOT_PATH: 'C:\\Users\\jin\\repo',
      DORKA_WORKTREE_PATH: 'C:\\Users\\jin\\repo-worktrees\\fix-1',
      CONDUCTOR_ROOT_PATH: 'C:\\Users\\jin\\repo',
      GHOSTX_ROOT_PATH: 'C:\\Users\\jin\\repo'
    }

    addDorkaWslInteropEnv(env)

    expect(env.WSLENV).toContain('DORKA_ROOT_PATH/p')
    expect(env.WSLENV).toContain('DORKA_WORKTREE_PATH/p')
    expect(env.WSLENV).toContain('CONDUCTOR_ROOT_PATH/p')
    expect(env.WSLENV).toContain('GHOSTX_ROOT_PATH/p')
    expect(env.WSLENV).not.toContain('DORKA_ROOT_PATH/u')
    expect(env.WSLENV).not.toContain('DORKA_WORKTREE_PATH/u')
  })

  it('always tags DORKA_WORKSPACE_NAME /u because it is a name, not a path', () => {
    const env: Record<string, string> = { DORKA_WORKSPACE_NAME: 'fix-1' }

    addDorkaWslInteropEnv(env)

    expect(env.WSLENV).toBe('DORKA_SHELL_READY_ROOT/p:DORKA_WORKSPACE_NAME/u')
  })

  it('does not register setup vars that are absent from the env', () => {
    const env: Record<string, string> = { DORKA_TERMINAL_HANDLE: 'term_wsl' }

    addDorkaWslInteropEnv(env)

    expect(env.WSLENV).toBe('DORKA_TERMINAL_HANDLE/u:DORKA_SHELL_READY_ROOT/p')
  })

  it('crosses the inline-image protocol hint into the guest untranslated (/u)', () => {
    const env: Record<string, string> = { DORKA_IMAGE_PROTOCOL: 'kitty' }
    addDorkaWslInteropEnv(env)
    expect(env.WSLENV).toContain('DORKA_IMAGE_PROTOCOL/u')
  })

  it('marks the WSL hook relay version for import on relay spawn envs', () => {
    const env: Record<string, string> = {
      DORKA_WSL_HOOK_RELAY_VERSION: '0.1.0+abc'
    }
    addDorkaWslInteropEnv(env)
    expect(env.WSLENV).toBe('DORKA_SHELL_READY_ROOT/p:DORKA_WSL_HOOK_RELAY_VERSION/u')
  })

  it('crosses a guest-side OpenCode config overlay untranslated (/u)', () => {
    const env: Record<string, string> = {
      OPENCODE_CONFIG_DIR: '/home/jin/.dorka-relay/opencode-overlays/abc',
      DORKA_OPENCODE_CONFIG_DIR: '/home/jin/.dorka-relay/opencode-overlays/abc'
    }
    addDorkaWslInteropEnv(env)
    expect(env.WSLENV).toContain('OPENCODE_CONFIG_DIR/u')
    expect(env.WSLENV).toContain('DORKA_OPENCODE_CONFIG_DIR/u')
    expect(env.WSLENV).not.toContain('OPENCODE_CONFIG_DIR/p')
  })

  it('never crosses a Windows OpenCode config dir into the guest', () => {
    // Why: the relay spawn env spreads process.env and the daemon inherits its
    // own — a /p entry here would deliver C:\... as /mnt/c and in-guest OpenCode
    // would adopt Dorka's Windows overlay as its config root.
    const env: Record<string, string> = {
      OPENCODE_CONFIG_DIR: 'C:\\Users\\jin\\AppData\\Roaming\\Dorka\\opencode-overlays\\abc',
      DORKA_OPENCODE_CONFIG_DIR: 'C:\\Users\\jin\\AppData\\Roaming\\Dorka\\opencode-overlays\\abc'
    }
    addDorkaWslInteropEnv(env)
    expect(env.WSLENV).not.toContain('OPENCODE_CONFIG_DIR')
    expect(env.WSLENV).not.toContain('DORKA_OPENCODE_CONFIG_DIR')
  })

  it('does not register the OpenCode config vars when they are absent', () => {
    const env: Record<string, string> = { DORKA_TERMINAL_HANDLE: 'term_wsl' }
    addDorkaWslInteropEnv(env)
    expect(env.WSLENV).not.toContain('OPENCODE_CONFIG_DIR')
    expect(env.WSLENV).not.toContain('DORKA_OPENCODE_CONFIG_DIR')
  })
})
