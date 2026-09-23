// Why: OMP 15.x discovers built-in user extensions from ~/.omp/agent, but a
// typed `omp` in an existing terminal still needs Dorka's status extension
// passed explicitly. Do not redirect PI_CODING_AGENT_DIR here: that variable
// is OMP's mutable home, so config/auth/session commands must keep the user's
// normal source of truth.

const OMP_SUBCOMMANDS = [
  '__complete',
  'acp',
  'agents',
  'auth-broker',
  'auth-gateway',
  'bench',
  'commit',
  'completions',
  'config',
  'dry-balance',
  'gallery',
  'grep',
  'grievances',
  'install',
  'join',
  'models',
  'plugin',
  'read',
  'say',
  'search',
  'setup',
  'shell',
  'ssh',
  'stats',
  'tiny-models',
  'token',
  'ttsr',
  'update',
  'usage',
  'worktree',
  'q',
  'wt'
] as const

export function getPosixOmpShellWrapper(): string {
  const subcommands = OMP_SUBCOMMANDS.map((value) => `'${value}'`).join('|')
  return `# Why: OMP does not auto-load Dorka's managed status extension; wrap only
# interactive launch invocations so subcommands such as \`omp config\` keep
# their normal argv shape.
__dorka_omp_should_skip_extension() {
  case "\${1:-}" in
    'help'|'--help'|'-h'|'--version'|'-v') return 0 ;;
    ${subcommands}) return 0 ;;
  esac
  return 1
}
__dorka_omp_cwd_is_usable() {
  local __dorka_physical_cwd
  [[ -x . ]] || return 1
  if [[ -n "\${PWD:-}" && -d "\${PWD:-}" ]]; then
    [[ "\${PWD}" -ef . ]]
  else
    # Why compare the path: shell builtins can print a cached path for a deleted cwd.
    __dorka_physical_cwd="$(builtin pwd -P 2>/dev/null)" || return 1
    [[ -d "$__dorka_physical_cwd" && "$__dorka_physical_cwd" -ef . ]]
  fi
}
__dorka_omp_invoke() {
  local __dorka_use_extension="$1"
  shift
  if [[ $__dorka_use_extension -eq 1 && -n "\${DORKA_OMP_STATUS_EXTENSION:-}" && -f "\${DORKA_OMP_STATUS_EXTENSION}" ]]; then
    if [[ "\${1:-}" == "launch" ]]; then
      shift
      command omp launch --extension "\${DORKA_OMP_STATUS_EXTENSION}" "$@"
    else
      command omp --extension "\${DORKA_OMP_STATUS_EXTENSION}" "$@"
    fi
  else
    command omp "$@"
  fi
}
__dorka_omp() {
  local __dorka_use_extension=1
  __dorka_omp_should_skip_extension "\${1:-}" && __dorka_use_extension=0
  if ! __dorka_omp_cwd_is_usable; then
    local __dorka_logical_cwd="\${PWD:-\${DORKA_WORKTREE_PATH:-\${DORKA_ROOT_PATH:-}}}"
    # Why: a restored shell can retain the deleted directory inode after its path is recreated.
    (
      if [[ -z "$__dorka_logical_cwd" ]]; then
        printf 'Dorka: OMP cannot start because no terminal working directory is available. Open a new terminal in an existing directory.\\n' >&2
        return 1
      fi
      if ! builtin cd -P -- "$__dorka_logical_cwd" 2>/dev/null; then
        printf 'Dorka: OMP cannot access the terminal working directory "%s". Open a new terminal in an existing directory.\\n' "$__dorka_logical_cwd" >&2
        return 1
      fi
      __dorka_omp_invoke "$__dorka_use_extension" "$@"
    )
  else
    __dorka_omp_invoke "$__dorka_use_extension" "$@"
  fi
}
if [[ -n "\${DORKA_OMP_STATUS_EXTENSION:-}" ]]; then
  # Why the function reserved word: it suppresses alias expansion of the name, which
  # an \`alias omp\` otherwise rewrites at parse time, aborting the rest of the file.
  function omp { __dorka_omp "$@"; }
fi
`
}

export function getPowerShellOmpShellWrapper(): string {
  const subcommands = OMP_SUBCOMMANDS.map((value) => `'${value}'`).join(', ')
  return `# Why: OMP does not auto-load Dorka's managed status extension; wrap only
# interactive launch invocations so subcommands such as \`omp config\` keep
# their normal argv shape.
function Global:__DorkaOmpShouldSkipExtension {
    param([string]$Name)
    $skip = @("help", "--help", "-h", "--version", "-v") + @(${subcommands})
    return $skip -contains $Name
}
if ($env:DORKA_OMP_STATUS_EXTENSION) {
    function Global:omp {
        $dorkaUseExtension = -not (__DorkaOmpShouldSkipExtension -Name ([string]($args[0])))
        $dorkaStatus = 0
        $dorkaCommand = Get-Command omp -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $dorkaCommand) {
            Write-Error "omp executable not found"
            $dorkaStatus = 127
        } elseif ($dorkaUseExtension -and $env:DORKA_OMP_STATUS_EXTENSION -and
            (Test-Path -LiteralPath $env:DORKA_OMP_STATUS_EXTENSION)) {
            if ($args.Count -gt 0 -and $args[0] -eq "launch") {
                $dorkaLaunchArgs = @($args | Select-Object -Skip 1)
                & $dorkaCommand.Source launch --extension $env:DORKA_OMP_STATUS_EXTENSION @dorkaLaunchArgs
            } else {
                & $dorkaCommand.Source --extension $env:DORKA_OMP_STATUS_EXTENSION @args
            }
            $dorkaStatus = $LASTEXITCODE
        } else {
            & $dorkaCommand.Source @args
            $dorkaStatus = $LASTEXITCODE
        }

        $global:LASTEXITCODE = $dorkaStatus
    }
}
`
}
