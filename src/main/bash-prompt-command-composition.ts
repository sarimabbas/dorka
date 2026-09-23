export const BASH_PROMPT_COMMAND_COMPOSITION_BLOCK = `__dorka_normalize_prompt_command_part() {
  local __dorka_value="$1" __dorka_output_name="$2" __dorka_character __dorka_chunk
  local __dorka_value_length=\${#1} __dorka_suffix_length=0 __dorka_backslash_length=0
  local __dorka_output_length __dorka_scan_start
  while (( __dorka_value_length - __dorka_suffix_length >= 1024 )); do
    __dorka_scan_start=$(( __dorka_value_length - __dorka_suffix_length - 1024 ))
    __dorka_chunk="\${__dorka_value:__dorka_scan_start:1024}"
    case "$__dorka_chunk" in
      *[!$' \\t\\n;']*) break ;;
      *) __dorka_suffix_length=$(( __dorka_suffix_length + 1024 )) ;;
    esac
  done
  while (( __dorka_suffix_length < __dorka_value_length )); do
    __dorka_character="\${__dorka_value: -__dorka_suffix_length - 1:1}"
    case "$__dorka_character" in
      ' '|$'\\t'|$'\\n'|';') __dorka_suffix_length=$(( __dorka_suffix_length + 1 )) ;;
      *) break ;;
    esac
  done
  __dorka_output_length=$(( \${#__dorka_value} - __dorka_suffix_length ))
  while (( __dorka_output_length - __dorka_backslash_length >= 1024 )); do
    __dorka_scan_start=$(( __dorka_output_length - __dorka_backslash_length - 1024 ))
    __dorka_chunk="\${__dorka_value:__dorka_scan_start:1024}"
    case "$__dorka_chunk" in
      *[!\\\\]*) break ;;
      *) __dorka_backslash_length=$(( __dorka_backslash_length + 1024 )) ;;
    esac
  done
  while (( __dorka_backslash_length < __dorka_output_length )); do
    __dorka_character="\${__dorka_value:__dorka_output_length - __dorka_backslash_length - 1:1}"
    [[ "$__dorka_character" == '\\' ]] || break
    __dorka_backslash_length=$(( __dorka_backslash_length + 1 ))
  done
  # Preserve the first separator when an odd backslash run escapes it.
  if (( __dorka_suffix_length > 0 && __dorka_backslash_length % 2 == 1 )); then
    __dorka_suffix_length=$(( __dorka_suffix_length - 1 ))
    __dorka_backslash_length=0
  fi
  __dorka_output_length=$(( \${#__dorka_value} - __dorka_suffix_length ))
  __dorka_value="\${__dorka_value:0:__dorka_output_length}"
  # Bash 4.4-5.0 scalar prompt evaluation preserves an odd terminal backslash.
  if (( __dorka_suffix_length == 0 && ((BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] == 0)) && __dorka_backslash_length % 2 == 1 )); then
    __dorka_value="$__dorka_value\\\\"
  fi
  printf -v "$__dorka_output_name" '%s' "$__dorka_value"
}
__dorka_restore_prompt_status() {
  return "$1"
}
__dorka_update_user_debug_trap() {
  local __dorka_debug_trap_spec="$1" __dorka_unchanged_debug_trap_spec="$2"
  local __dorka_debug_trap_command
  [[ "$__dorka_debug_trap_spec" != "$__dorka_unchanged_debug_trap_spec" ]] || return 0
  [[ "$__dorka_debug_trap_spec" != "trap -- '__dorka_osc133_preexec' DEBUG" ]] || return 0
  if [[ -z "$__dorka_debug_trap_spec" ]]; then
    __dorka_user_debug_trap=""
    unset __dorka_chained_debug_trap
    return 0
  fi
  __dorka_debug_trap_command="\${__dorka_debug_trap_spec#trap -- }"
  __dorka_debug_trap_command="\${__dorka_debug_trap_command% DEBUG}"
  eval "__dorka_user_debug_trap=$__dorka_debug_trap_command"
  unset __dorka_chained_debug_trap
}
__dorka_run_user_debug_trap() {
  if [[ -n "\${__dorka_user_debug_trap:-}" ]]; then
    eval "$__dorka_user_debug_trap" || true
  fi
}
__dorka_adopt_outer_debug_trap() {
  local __dorka_debug_trap_spec="\${__dorka_outer_debug_trap_spec:-}"
  unset __dorka_outer_debug_trap_spec
  __dorka_update_user_debug_trap "$__dorka_debug_trap_spec" "trap -- '__dorka_osc133_preexec' DEBUG"
}
__dorka_run_prompt_command_array() {
  local __dorka_exit_code="\${__dorka_prompt_status:-$?}" __dorka_prompt_part __dorka_prompt_index __dorka_user_count
  local __dorka_suffix_part
  local __dorka_final_prompt_command
  local __dorka_in_prompt_dispatch=1 __dorka_dispatching_user_prompt_command=""
  unset __dorka_prompt_status
  __dorka_adopt_outer_debug_trap
  trap '__dorka_osc133_preexec' DEBUG
  for __dorka_prompt_part in "\${__dorka_prompt_command_prefix[@]+"\${__dorka_prompt_command_prefix[@]}"}"; do
    if (( __dorka_exit_code == 0 )); then
      eval "$__dorka_prompt_part"
    else
      __dorka_restore_prompt_status "$__dorka_exit_code" || eval "$__dorka_prompt_part"
    fi
  done
  __dorka_user_count=0
  for __dorka_prompt_part in "\${__dorka_prompt_command_array[@]+"\${__dorka_prompt_command_array[@]}"}"; do
    __dorka_user_count=$(( __dorka_user_count + 1 ))
  done
  for (( __dorka_prompt_index = 0; __dorka_prompt_index + 1 < __dorka_user_count; __dorka_prompt_index++ )); do
    __dorka_prompt_part="\${__dorka_prompt_command_array[__dorka_prompt_index]}"
    __dorka_dispatching_user_prompt_command=1
    if (( __dorka_exit_code == 0 )); then
      eval "$__dorka_prompt_part"
    else
      __dorka_restore_prompt_status "$__dorka_exit_code" || eval "$__dorka_prompt_part"
    fi
    __dorka_dispatching_user_prompt_command=""
  done
  if (( __dorka_user_count > 0 )); then
    __dorka_prompt_part="\${__dorka_prompt_command_array[__dorka_user_count - 1]}"
    # Why: keep the final user hook and Dorka suffixes in one status-preserving eval.
    __dorka_final_prompt_command='eval "$__dorka_prompt_part"'
    for __dorka_suffix_part in "\${__dorka_prompt_command_suffix[@]+"\${__dorka_prompt_command_suffix[@]}"}"; do
      __dorka_final_prompt_command+=$'\\n'"$__dorka_suffix_part"
    done
    __dorka_dispatching_user_prompt_command=1
    if (( __dorka_exit_code == 0 )); then
      eval "$__dorka_final_prompt_command"
    else
      __dorka_restore_prompt_status "$__dorka_exit_code" || eval "$__dorka_final_prompt_command"
    fi
    __dorka_dispatching_user_prompt_command=""
  else
    for __dorka_prompt_part in "\${__dorka_prompt_command_suffix[@]+"\${__dorka_prompt_command_suffix[@]}"}"; do
      if (( __dorka_exit_code == 0 )); then
        eval "$__dorka_prompt_part"
      else
        __dorka_restore_prompt_status "$__dorka_exit_code" || eval "$__dorka_prompt_part"
      fi
    done
  fi
  return "$__dorka_exit_code"
}
__dorka_finish_legacy_prompt_dispatch() {
  local __dorka_suffix_part
  if [[ -n "\${__dorka_in_prompt_command:-}" ]]; then
    for __dorka_suffix_part in "\${__dorka_prompt_command_suffix[@]+"\${__dorka_prompt_command_suffix[@]}"}"; do
      eval "$__dorka_suffix_part"
    done
  fi
  trap '__dorka_osc133_preexec' DEBUG
  unset __dorka_in_legacy_prompt_wrapper
}
__dorka_normalize_prompt_command() {
  [[ -z "\${__dorka_prompt_command_normalized:-}" ]] || return 0
  local __dorka_prompt_part
  local -a __dorka_normalized=()
  for __dorka_prompt_part in "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}"; do
    __dorka_normalize_prompt_command_part "$__dorka_prompt_part" __dorka_prompt_part
    [[ -n "$__dorka_prompt_part" ]] && __dorka_normalized+=("$__dorka_prompt_part")
  done
  __dorka_prompt_command_normalized=1
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND=("\${__dorka_normalized[@]+"\${__dorka_normalized[@]}"}")
  else
    __dorka_prompt_command_array=("\${__dorka_normalized[@]+"\${__dorka_normalized[@]}"}")
    __dorka_prompt_command_prefix=()
    __dorka_prompt_command_suffix=()
    unset PROMPT_COMMAND
    # Why: PID scope distinguishes legacy prompt dispatch from ordinary user command text.
    __dorka_prompt_status_variable="__dorka_prompt_status_$$"
    __dorka_prompt_status_capture_command="$__dorka_prompt_status_variable=\\$?"
    __dorka_prompt_status_value="\\\${$__dorka_prompt_status_variable}"
    PROMPT_COMMAND="$__dorka_prompt_status_capture_command; __dorka_prompt_status=$__dorka_prompt_status_value"'; __dorka_prompt_had_functrace=""; if [[ -o functrace ]]; then __dorka_prompt_had_functrace=1; set +T; fi; __dorka_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__dorka_prompt_had_functrace" ]] || set -T; unset __dorka_prompt_had_functrace; __dorka_run_prompt_command_array; __dorka_finish_legacy_prompt_dispatch'
  fi
}
__dorka_prepend_prompt_command() {
  local command="$1"
  __dorka_normalize_prompt_command
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND=("$command" "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}")
  else
    __dorka_prompt_command_prefix=("$command" "\${__dorka_prompt_command_prefix[@]+"\${__dorka_prompt_command_prefix[@]}"}")
  fi
}
__dorka_append_prompt_command() {
  local command="$1"
  __dorka_normalize_prompt_command
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND+=("$command")
  else
    __dorka_prompt_command_suffix+=("$command")
  fi
}`
