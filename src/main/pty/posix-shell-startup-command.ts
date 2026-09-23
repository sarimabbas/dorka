import { basename, win32 as pathWin32 } from 'node:path'

export const POSIX_SHELL_STARTUP_COMMAND_ENV = 'DORKA_POSIX_SHELL_STARTUP_COMMAND'

export function supportsPosixShellStartupCommand(shellPath: string): boolean {
  const shellName = pathWin32.basename(basename(shellPath)).toLowerCase()
  return shellName === 'bash' || shellName === 'zsh' || shellName === 'fish'
}

export function getBashStartupCommandPromptBlock(): string {
  return `if [[ \${${POSIX_SHELL_STARTUP_COMMAND_ENV}+present} == present ]]; then
  __dorka_remove_startup_command_prompt_hook() {
    local __dorka_item
    local -a __dorka_remaining=()
    if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
      for __dorka_item in "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}"; do
        [[ "$__dorka_item" == "__dorka_run_startup_command" ]] || __dorka_remaining+=("$__dorka_item")
      done
      PROMPT_COMMAND=("\${__dorka_remaining[@]+"\${__dorka_remaining[@]}"}")
    else
      for __dorka_item in "\${__dorka_prompt_command_suffix[@]+"\${__dorka_prompt_command_suffix[@]}"}"; do
        [[ "$__dorka_item" == "__dorka_run_startup_command" ]] || __dorka_remaining+=("$__dorka_item")
      done
      __dorka_prompt_command_suffix=("\${__dorka_remaining[@]+"\${__dorka_remaining[@]}"}")
    fi
  }
  __dorka_run_startup_command() {
    local __dorka_command="$${POSIX_SHELL_STARTUP_COMMAND_ENV}" __dorka_status
    unset ${POSIX_SHELL_STARTUP_COMMAND_ENV}
    __dorka_remove_startup_command_prompt_hook
    unset -f __dorka_remove_startup_command_prompt_hook
    builtin history -s "$__dorka_command" 2>/dev/null || true
    builtin printf '%s\n' "$__dorka_command"
    eval "$__dorka_command"
    __dorka_status=$?
    unset -f __dorka_run_startup_command
    return "$__dorka_status"
  }
  __dorka_append_prompt_command "__dorka_run_startup_command"
fi`
}
