import {
  buildWindowsAgentHookPostCommand,
  wrapPosixHookCommand,
  wrapWindowsHookCommand
} from '../agent-hooks/installer-utils'
import {
  buildPosixHookPayloadCapture,
  buildPosixHookSpoolLines,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue
} from '../agent-hooks/hook-stdin-contract'
import {
  buildPosixGrokReplayGuardLines,
  buildWindowsGrokReplayGuardLines
} from '../agent-hooks/grok-replay-guard'
import { getCursorHookResponse, type CursorEvent } from './hook-events'

const CURSOR_HOOK_RESPONSE_ENV = 'DORKA_CURSOR_HOOK_RESPONSE'

export function getPosixManagedCommand(scriptPath: string, eventName: CursorEvent): string {
  const response = getCursorHookResponse(eventName)
  return wrapPosixHookCommand(
    scriptPath,
    { [CURSOR_HOOK_RESPONSE_ENV]: response },
    { fallbackStdout: response }
  )
}

export function getManagedCommand(scriptPath: string, eventName: CursorEvent): string {
  const response = getCursorHookResponse(eventName)
  return process.platform === 'win32'
    ? wrapWindowsHookCommand(
        scriptPath,
        { [CURSOR_HOOK_RESPONSE_ENV]: response },
        { fallbackStdout: response }
      )
    : getPosixManagedCommand(scriptPath, eventName)
}

export function getManagedScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      // Why: Cursor permission hooks fail closed on empty/invalid stdout (#15462).
      `if defined ${CURSOR_HOOK_RESPONSE_ENV} (echo %${CURSOR_HOOK_RESPONSE_ENV}%) else (echo {})`,
      // Why: source current endpoint coordinates for PTYs surviving an Dorka restart.
      'if defined DORKA_AGENT_HOOK_ENDPOINT if exist "%DORKA_AGENT_HOOK_ENDPOINT%" call "%DORKA_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...buildWindowsHookEnvironmentGuardLines(),
      ...buildWindowsGrokReplayGuardLines(),
      buildWindowsAgentHookPostCommand('cursor'),
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    // Why: Cursor permission hooks fail closed on empty/invalid stdout (#15462).
    `if [ -n "$${CURSOR_HOOK_RESPONSE_ENV}" ]; then`,
    `  printf '%s\\n' "$${CURSOR_HOOK_RESPONSE_ENV}"`,
    'else',
    '  printf "{}\\n"',
    'fi',
    ...buildPosixHookPayloadCapture(),
    ...buildPosixGrokReplayGuardLines(),
    ...buildPosixHookSpoolLines('cursor'),
    // Why: refresh endpoint coordinates so surviving PTYs keep reporting.
    'if [ -n "$DORKA_AGENT_HOOK_ENDPOINT" ] && [ -r "$DORKA_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$DORKA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$DORKA_AGENT_HOOK_PORT" ] || [ -z "$DORKA_AGENT_HOOK_TOKEN" ] || [ -z "$DORKA_PANE_KEY" ]; then',
    '  spool_hook_event',
    '  exit 0',
    'fi',
    // Why: post form fields because path-bearing worktree IDs are unsafe in hand-built JSON.
    // Why: pipe payload to curl stdin to keep large output off the command line.
    'printf \'%s\' "$payload" | curl -sS -X POST "http://127.0.0.1:${DORKA_AGENT_HOOK_PORT}/hook/cursor" \\',
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Dorka-Agent-Hook-Token: ${DORKA_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${DORKA_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${DORKA_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${DORKA_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${DORKA_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${DORKA_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${DORKA_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || spool_hook_event',
    'exit 0',
    ''
  ].join('\n')
}
