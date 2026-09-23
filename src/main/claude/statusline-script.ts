import {
  buildWindowsHookStdinDrainEpilogue,
  WINDOWS_HOOK_STDIN_DRAIN_LABEL,
  WINDOWS_HOOK_STDIN_READER
} from '../agent-hooks/hook-stdin-contract'
import {
  CLAUDE_STATUSLINE_MIN_POST_INTERVAL_SECONDS,
  CLAUDE_STATUSLINE_PATHNAME
} from '../../shared/claude-statusline-rate-limits'

const STATUSLINE_CLEANUP_LABEL = 'dorka_statusline_cleanup'
const STATUSLINE_PROBE_LABEL = 'dorka_statusline_probe'

// Why: Claude Code pipes `rate_limits` to the statusLine command on every turn; forwarding
// it gives Dorka live usage without spending the OAuth usage endpoint's tight budget.
// Emits no stdout so the in-terminal status line stays visually unchanged.
export function getManagedStatusLineScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      // Why: a backgrounded session's statusline runs in a daemon worker that inherited the
      // dispatching pane's env, so DORKA_PANE_KEY names a pane it does not run in (#9236).
      // Why exit, not the drain label: a worker is outside an Dorka pane, so reading stdin to
      // EOF can block forever (#11549). This gates before stdin is owned, per that contract.
      'if not "%CLAUDE_JOB_DIR%"=="" exit /b 0',
      // Why: pane key is static PTY env (the endpoint file never sets it), so it can gate before stdin is consumed.
      `if "%DORKA_PANE_KEY%"=="" goto :${WINDOWS_HOOK_STDIN_DRAIN_LABEL}`,
      // Why: current keys end in a UUID; replacing the legacy delimiter also keeps surviving numeric-pane keys filename-safe.
      'set "DORKA_STATUSLINE_PANE_ID=%DORKA_PANE_KEY:~-36%"',
      'set "DORKA_STATUSLINE_PANE_ID=%DORKA_STATUSLINE_PANE_ID::=_%"',
      // Why: cmd has no builtin stdin capture, so buffer the payload in a per-pane temp file
      // (%RANDOM% collides across same-second cmd spawns) to guard before any curl spawn.
      'set "DORKA_STATUSLINE_PAYLOAD_FILE=%TEMP%\\dorka-claude-statusline-%DORKA_STATUSLINE_PANE_ID%.tmp"',
      `${WINDOWS_HOOK_STDIN_READER} >"%DORKA_STATUSLINE_PAYLOAD_FILE%" 2>nul`,
      // Why: an all-builtin seconds-of-day throttle avoids spawning findstr+curl on every streaming tick.
      'set "DORKA_STATUSLINE_STAMP_FILE=%TEMP%\\dorka-claude-statusline-last-%DORKA_STATUSLINE_PANE_ID%.tmp"',
      'set "DORKA_STATUSLINE_NOW="',
      'set "DORKA_STATUSLINE_TIME=%TIME: =0%"',
      'for /f "tokens=1-3 delims=:.," %%a in ("%DORKA_STATUSLINE_TIME%") do set /a "DORKA_STATUSLINE_NOW=(1%%a %% 100)*3600+(1%%b %% 100)*60+(1%%c %% 100)" 2>nul',
      'set "DORKA_STATUSLINE_LAST="',
      'set "DORKA_STATUSLINE_ELAPSED="',
      'if exist "%DORKA_STATUSLINE_STAMP_FILE%" set /p DORKA_STATUSLINE_LAST=<"%DORKA_STATUSLINE_STAMP_FILE%"',
      'if defined DORKA_STATUSLINE_LAST for /f "delims=0123456789" %%d in ("%DORKA_STATUSLINE_LAST%") do set "DORKA_STATUSLINE_LAST="',
      'if defined DORKA_STATUSLINE_NOW if defined DORKA_STATUSLINE_LAST set /a "DORKA_STATUSLINE_ELAPSED=DORKA_STATUSLINE_NOW-DORKA_STATUSLINE_LAST" 2>nul',
      `if not defined DORKA_STATUSLINE_ELAPSED goto :${STATUSLINE_PROBE_LABEL}`,
      `if %DORKA_STATUSLINE_ELAPSED% GEQ 0 if %DORKA_STATUSLINE_ELAPSED% LSS ${CLAUDE_STATUSLINE_MIN_POST_INTERVAL_SECONDS} goto :${STATUSLINE_CLEANUP_LABEL}`,
      `:${STATUSLINE_PROBE_LABEL}`,
      // Why: rate_limits appears only for Claude.ai-subscriber sessions after the first API response; the
      // statusline ticks ~3x/sec during streaming, so skip the endpoint call and curl spawn otherwise.
      // Why: \" is the MSVC argv escape — findstr sees the quoted JSON key, so a cwd containing rate_limits can't false-match (POSIX guard parity).
      '"%SystemRoot%\\System32\\findstr.exe" /c:\\"rate_limits\\" "%DORKA_STATUSLINE_PAYLOAD_FILE%" >nul 2>nul',
      `if errorlevel 1 goto :${STATUSLINE_CLEANUP_LABEL}`,
      // Why: call the endpoint file to refresh port/token — a PTY that survived an Dorka restart carries stale env; falls through to PTY env if missing.
      'if defined DORKA_AGENT_HOOK_ENDPOINT if exist "%DORKA_AGENT_HOOK_ENDPOINT%" call "%DORKA_AGENT_HOOK_ENDPOINT%" 2>nul',
      `if "%DORKA_AGENT_HOOK_PORT%"=="" goto :${STATUSLINE_CLEANUP_LABEL}`,
      `if "%DORKA_AGENT_HOOK_TOKEN%"=="" goto :${STATUSLINE_CLEANUP_LABEL}`,
      // Why: stamp only when a post is certain, so skipped ticks (no rate_limits, missing port/token) never push the next allowed post out.
      'if defined DORKA_STATUSLINE_NOW (>"%DORKA_STATUSLINE_STAMP_FILE%" echo %DORKA_STATUSLINE_NOW%)',
      // Why: pre-build the field from an always-defined variable so an unset CLAUDE_CONFIG_DIR posts
      // empty (matching POSIX and the null attribution snapshot), never a literal %VAR% token.
      'set "DORKA_STATUSLINE_CONFIG_DIR_FIELD=configDir="',
      'if defined CLAUDE_CONFIG_DIR set "DORKA_STATUSLINE_CONFIG_DIR_FIELD=configDir=%CLAUDE_CONFIG_DIR%"',
      [
        '"%SystemRoot%\\System32\\curl.exe" -sS -X POST',
        `"http://127.0.0.1:%DORKA_AGENT_HOOK_PORT%${CLAUDE_STATUSLINE_PATHNAME}"`,
        '--connect-timeout 0.5 --max-time 1.5',
        '-H "Content-Type: application/x-www-form-urlencoded"',
        '-H "X-Dorka-Agent-Hook-Token: %DORKA_AGENT_HOOK_TOKEN%"',
        '--data-urlencode "paneKey=%DORKA_PANE_KEY%"',
        '--data-urlencode "%DORKA_STATUSLINE_CONFIG_DIR_FIELD%"',
        '--data-urlencode "env=%DORKA_AGENT_HOOK_ENV%"',
        '--data-urlencode "version=%DORKA_AGENT_HOOK_VERSION%"',
        '--data-urlencode "payload@%DORKA_STATUSLINE_PAYLOAD_FILE%"',
        '>nul 2>&1'
      ].join(' '),
      `:${STATUSLINE_CLEANUP_LABEL}`,
      'del "%DORKA_STATUSLINE_PAYLOAD_FILE%" >nul 2>nul',
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    // Why: this runs on every statusline tick; builtin capture avoids replacing curl churn with cat churn.
    'payload=',
    'while IFS= read -r dorka_statusline_line || [ -n "$dorka_statusline_line" ]; do',
    '  payload="${payload}${dorka_statusline_line}\n"',
    'done',
    'payload=${payload%?}',
    'if [ -z "$payload" ]; then',
    '  exit 0',
    'fi',
    // Why: a backgrounded session's statusline runs in a daemon worker that inherited the
    // dispatching pane's env, so DORKA_PANE_KEY names a pane it does not run in (#9236).
    // Placed after capture: POSIX hooks own stdin first, or the agent sees EPIPE (#8110).
    'if [ -n "$CLAUDE_JOB_DIR" ]; then',
    '  exit 0',
    'fi',
    // Why: rate_limits appears only for Claude.ai-subscriber sessions after the first API response; skip the post (and its curl spawn) otherwise.
    'case "$payload" in',
    '  *\'"rate_limits"\'*) ;;',
    '  *) exit 0 ;;',
    'esac',
    'if [ -n "$DORKA_AGENT_HOOK_ENDPOINT" ] && [ -r "$DORKA_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$DORKA_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$DORKA_AGENT_HOOK_PORT" ] || [ -z "$DORKA_AGENT_HOOK_TOKEN" ] || [ -z "$DORKA_PANE_KEY" ]; then',
    '  exit 0',
    'fi',
    // Why: the stable leaf UUID avoids path-unsafe and overlong user-supplied tab ids.
    'dorka_statusline_pane_id=${DORKA_PANE_KEY##*:}',
    // Why: pre-migration numeric leaf ids were tab-local, so include a safe tab id to avoid cross-pane throttle collisions after upgrade.
    'case "$dorka_statusline_pane_id" in',
    "  ''|*[!0-9]*) ;;",
    '  *)',
    '    dorka_statusline_tab_id=${DORKA_PANE_KEY%:*}',
    '    case "$dorka_statusline_tab_id" in',
    "      ''|*[!A-Za-z0-9._-]*) ;;",
    '      *) dorka_statusline_pane_id="${dorka_statusline_tab_id}_${dorka_statusline_pane_id}" ;;',
    '    esac',
    '    ;;',
    'esac',
    'dorka_statusline_stamp="${TMPDIR:-/tmp}/dorka-claude-statusline-last-${dorka_statusline_pane_id}"',
    // Why: the payload clock keeps throttled ticks free of subprocesses; date is only a schema-drift fallback.
    'dorka_statusline_now=',
    'case "$payload" in',
    '  *\'"total_duration_ms"\'*)',
    '    dorka_statusline_duration=${payload#*\'"total_duration_ms"\'}',
    '    dorka_statusline_duration=${dorka_statusline_duration#*:}',
    '    dorka_statusline_duration=${dorka_statusline_duration#"${dorka_statusline_duration%%[![:space:]]*}"}',
    '    dorka_statusline_duration=${dorka_statusline_duration%%[!0-9]*}',
    '    case "$dorka_statusline_duration" in',
    '      0|[1-9]|[1-9][0-9]*)',
    '        if [ "${#dorka_statusline_duration}" -le 15 ]; then',
    '          dorka_statusline_now=$((dorka_statusline_duration / 1000))',
    '        fi',
    '        ;;',
    '    esac',
    '    ;;',
    'esac',
    'if [ -z "$dorka_statusline_now" ]; then',
    '  dorka_statusline_now=$(date +%s 2>/dev/null) || dorka_statusline_now=',
    'fi',
    // Why: leading zeros read as octal inside $(( )), and a bad constant (008) is FATAL in dash —
    // the script would die before rewriting the stamp, wedging the pane dark. Allow-list canonical
    // decimals so any malformed value fails open to posting instead.
    'case "$dorka_statusline_now" in 0|[1-9]|[1-9][0-9]*) ;; *) dorka_statusline_now= ;; esac',
    'if [ -n "$dorka_statusline_now" ] && [ -f "$dorka_statusline_stamp" ]; then',
    '  dorka_statusline_last=',
    '  IFS= read -r dorka_statusline_last <"$dorka_statusline_stamp" 2>/dev/null || :',
    '  case "$dorka_statusline_last" in 0|[1-9]|[1-9][0-9]*) ;; *) dorka_statusline_last= ;; esac',
    '  if [ "${#dorka_statusline_last}" -gt 15 ]; then dorka_statusline_last=; fi',
    '  if [ -n "$dorka_statusline_last" ]; then',
    '    dorka_statusline_elapsed=$((dorka_statusline_now - dorka_statusline_last))',
    `    if [ "$dorka_statusline_elapsed" -ge 0 ] && [ "$dorka_statusline_elapsed" -lt ${CLAUDE_STATUSLINE_MIN_POST_INTERVAL_SECONDS} ]; then`,
    '      exit 0',
    '    fi',
    '  fi',
    'fi',
    'if [ -n "$dorka_statusline_now" ]; then',
    '  printf \'%s\' "$dorka_statusline_now" >"$dorka_statusline_stamp" 2>/dev/null || :',
    'fi',
    `printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:\${DORKA_AGENT_HOOK_PORT}${CLAUDE_STATUSLINE_PATHNAME}" \\`,
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Dorka-Agent-Hook-Token: ${DORKA_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${DORKA_PANE_KEY}" \\',
    '  --data-urlencode "configDir=${CLAUDE_CONFIG_DIR}" \\',
    '  --data-urlencode "env=${DORKA_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${DORKA_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || true',
    'exit 0',
    ''
  ].join('\n')
}
