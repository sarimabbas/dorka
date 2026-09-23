/**
 * Content of the bash rcfile Dorka launches interactive bash with.
 *
 * Why: bash gets a single `--rcfile` wrapper (not a ZDOTDIR tree), so the login
 * startup-file chain, OSC 133 hooks, and the shell-ready marker all live here.
 */
import { BASH_PROMPT_COMMAND_COMPOSITION_BLOCK } from '../bash-prompt-command-composition'
import { getPosixOmpShellWrapper } from '../pty/omp-shell-wrapper'
import { getPosixCodexShellLaunchPreflight } from '../pty/codex-shell-launch-preflight'
import { getBashStartupCommandPromptBlock } from '../pty/posix-shell-startup-command'
import { BASH_FEATURE_CHANNEL_BLOCK, SHELL_STARTUP_IDENTITY_MARKER_BLOCK } from '../shell-templates'
import { SHELL_READY_MARKER_ESCAPED } from './local-pty-shell-ready-marker'

export function getBashShellReadyRcfileContent(): string {
  return `# Dorka bash shell-ready wrapper
${BASH_FEATURE_CHANNEL_BLOCK}
${SHELL_STARTUP_IDENTITY_MARKER_BLOCK}
# Why a plain variable: the channel is consumed and destroyed in these first
# lines, so nothing this shell later spawns can see or inherit the selection.
__dorka_ready_marker=""
__dorka_has_feature ready && __dorka_ready_marker=1
unset _dorka_shell_features
unset -f __dorka_has_feature
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
# Why: enable bracketed paste so Dorka can deliver a multiline startup prompt as
# a single literal paste (ESC[200~…ESC[201~). Without it, older readline builds
# treat each embedded newline as Enter and mangle the prompt into PS2
# continuation. Modern readline defaults this on; force it for the rest.
[[ $- == *i* ]] && bind 'set enable-bracketed-paste on' 2>/dev/null
# Why: preserve bash's normal login-shell contract. Many users already source
# ~/.bashrc from ~/.bash_profile; forcing ~/.bashrc again here would duplicate
# PATH edits, hooks, and prompt init in Dorka startup-command shells.
__dorka_restore_agent_teams_path() {
  [[ -n "\${DORKA_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${DORKA_AGENT_TEAMS_SHIM_DIR}"|"\${DORKA_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${DORKA_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
__dorka_restore_agent_teams_path
# Why: user startup files may set the default OpenCode config after Dorka's
# spawn env; restore the Dorka-managed config dir before the first prompt.
[[ -n "\${DORKA_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${DORKA_OPENCODE_CONFIG_DIR}"
[[ -n "\${DORKA_MIMOCODE_HOME:-}" ]] && export MIMOCODE_HOME="\${DORKA_MIMOCODE_HOME}"
${getPosixOmpShellWrapper()}
# Why: Codex must keep using Dorka's runtime CODEX_HOME after profile scripts.
[[ -n "\${DORKA_CODEX_HOME:-}" ]] && export CODEX_HOME="\${DORKA_CODEX_HOME}"
${getPosixCodexShellLaunchPreflight()}
# Why: emit OSC 133 C/D so terminal-command-lifecycle can drop stale agent
# status when the foreground command (e.g. an interrupted Claude/Codex CLI)
# exits — mirrors the zsh wrapper. Without this, bash users (default on most
# Linux distros) keep a stuck 'working' spinner for up to 30 min after the
# CLI exits without sending a Stop/SessionEnd hook.
__dorka_initializing_wrapper=1
__dorka_osc133_precmd() {
  local exit_code=$?
  __dorka_in_prompt_command=1
  if [[ -n "\${__dorka_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __dorka_in_command
  fi
  printf "\\033]133;A\\007"
  return "$exit_code"
}
__dorka_osc133_prompt_done() {
  unset __dorka_in_prompt_command
  __dorka_adopt_outer_debug_trap
  trap '__dorka_osc133_preexec' DEBUG
}
__dorka_osc133_preexec() {
  if [[ -n "\${__dorka_prompt_status_capture_command:-}" && "$BASH_COMMAND" == "$__dorka_prompt_status_capture_command" ]]; then
    unset __dorka_initial_prompt
    __dorka_in_legacy_prompt_wrapper=1
    return 0
  fi
  if [[ -n "\${__dorka_initializing_wrapper:-}\${__dorka_in_debug_capture:-}\${__dorka_initial_prompt:-}\${__dorka_in_prompt_dispatch:-}\${__dorka_in_legacy_prompt_wrapper:-}\${__dorka_in_prompt_command:-}" ]]; then
    [[ -z "\${__dorka_initializing_wrapper:-}\${__dorka_in_debug_capture:-}" ]] || return 0
    if [[ -n "\${__dorka_initial_prompt:-}" && "$BASH_COMMAND" == "__dorka_osc133_precmd" ]]; then
      unset __dorka_initial_prompt; return 0
    fi
    if [[ -n "\${__dorka_in_prompt_dispatch:-}" ]]; then
      [[ -n "\${__dorka_dispatching_user_prompt_command:-}" ]] || return 0
      if [[ "\${FUNCNAME[1]:-}" == "__dorka_run_prompt_command_array" ]]; then
        case "$BASH_COMMAND" in
          '(( __dorka_exit_code == 0 ))'|'__dorka_restore_prompt_status "$__dorka_exit_code"'|'eval "$__dorka_prompt_part"'|'eval "$__dorka_final_prompt_command"'|__dorka_dispatching_user_prompt_command=*|__dorka_osc133_precmd|__dorka_osc133_prompt_done|__dorka_prompt_mark) return 0 ;;
        esac
      fi
    elif [[ "\${FUNCNAME[1]:-}" == "__dorka_run_prompt_command_array" || "$BASH_COMMAND" == "__dorka_run_prompt_command_array" ]]; then
      return 0
    fi
    [[ -z "\${__dorka_in_legacy_prompt_wrapper:-}" || -n "\${__dorka_dispatching_user_prompt_command:-}" ]] || return 0
    if [[ -n "\${__dorka_in_prompt_command:-}" && "$BASH_COMMAND" == "__dorka_in_debug_capture=1" ]]; then
      return 0
    fi
  fi
  case "\${FUNCNAME[1]:-}" in __dorka_osc133_*|__dorka_prompt_mark|__dorka_restore_prompt_status) return 0 ;; esac
  case "$BASH_COMMAND" in __dorka_osc133_precmd|__dorka_osc133_prompt_done|__dorka_prompt_mark) return 0 ;; esac
  __dorka_run_user_debug_trap
  [[ -z "\${__dorka_in_prompt_command:-}" ]] || return 0
  [[ -z "\${__dorka_in_command:-}" ]] || return 0
  # Why: bash DEBUG fires for every simple command, including PROMPT_COMMAND
  # bodies and chained traps can call us repeatedly for one command.
  printf "\\033]133;C\\007"
  __dorka_in_command=1
}
# Why: prepend so we capture $? before the user's PROMPT_COMMAND chain mutates it.
${BASH_PROMPT_COMMAND_COMPOSITION_BLOCK}
__dorka_prepend_prompt_command "__dorka_osc133_precmd"
# Why: append the marker through PROMPT_COMMAND so it fires after the login
# startup files have rebuilt the prompt, without re-running user rc files.
if [[ -n "$__dorka_ready_marker" ]]; then
  __dorka_prompt_mark() {
    printf "${SHELL_READY_MARKER_ESCAPED}"
  }
  __dorka_append_prompt_command "__dorka_prompt_mark"
fi
__dorka_append_prompt_command '__dorka_in_debug_capture=1; __dorka_prompt_had_functrace=""; if [[ -o functrace ]]; then __dorka_prompt_had_functrace=1; set +T; fi; __dorka_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__dorka_prompt_had_functrace" ]] || set -T; unset __dorka_prompt_had_functrace __dorka_in_debug_capture'
__dorka_append_prompt_command "__dorka_osc133_prompt_done"
${getBashStartupCommandPromptBlock()}
__dorka_had_functrace=""
[[ -o functrace ]] && __dorka_had_functrace=1
set +T
__dorka_debug_trap_spec="$(trap -p DEBUG)"
[[ -z "$__dorka_had_functrace" ]] || set -T
if [[ -n "$__dorka_debug_trap_spec" && "$__dorka_debug_trap_spec" != "trap -- '__dorka_osc133_preexec' DEBUG" ]]; then
  __dorka_debug_trap_command="\${__dorka_debug_trap_spec#trap -- }"
  __dorka_debug_trap_command="\${__dorka_debug_trap_command% DEBUG}"
  eval "__dorka_user_debug_trap=$__dorka_debug_trap_command"
fi
unset __dorka_debug_trap_spec __dorka_debug_trap_command __dorka_had_functrace
unset -f __dorka_normalize_prompt_command_part __dorka_normalize_prompt_command __dorka_prepend_prompt_command __dorka_append_prompt_command
unset __dorka_prompt_command_normalized
# Why: arm DEBUG after wrapper setup; otherwise bash treats our own rcfile
# commands as a foreground command and emits a fake C/D before the first prompt.
__dorka_initial_prompt=1
trap '__dorka_osc133_preexec' DEBUG
unset __dorka_initializing_wrapper
`
}
