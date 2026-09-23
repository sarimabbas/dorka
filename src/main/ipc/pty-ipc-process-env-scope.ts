// Why: the pty IPC suites force darwin and rewrite a dozen agent-home env vars per test;
// this scope captures the real values once and puts them back afterwards.
export function createPtyIpcProcessEnvScope() {
  const savedOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR
  const savedDorkaOpenCodeConfigDir = process.env.DORKA_OPENCODE_CONFIG_DIR
  const savedDorkaOpenCodeSourceConfigDir = process.env.DORKA_OPENCODE_SOURCE_CONFIG_DIR
  const savedPiAgentDir = process.env.PI_CODING_AGENT_DIR
  const savedDorkaPiAgentDir = process.env.DORKA_PI_CODING_AGENT_DIR
  const savedDorkaPiSourceAgentDir = process.env.DORKA_PI_SOURCE_AGENT_DIR
  const savedDorkaCodexHome = process.env.DORKA_CODEX_HOME
  const savedDorkaOmpAgentDir = process.env.DORKA_OMP_CODING_AGENT_DIR
  const savedDorkaOmpSourceAgentDir = process.env.DORKA_OMP_SOURCE_AGENT_DIR
  const savedDorkaOmpStatusExtension = process.env.DORKA_OMP_STATUS_EXTENSION
  const savedPrimeAgentDir = process.env.PRIME_AGENT_CODING_AGENT_DIR
  const savedDorkaPrimeAgentSourceDir = process.env.DORKA_PRIME_AGENT_SOURCE_AGENT_DIR
  const savedDorkaPrimeAgentStatusExtension = process.env.DORKA_PRIME_AGENT_STATUS_EXTENSION
  const savedDorkaClaudeAgentStatusSettings = process.env.DORKA_CLAUDE_AGENT_STATUS_SETTINGS
  const savedProcessPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const savedDisableMacosLoginShell = process.env.DORKA_DISABLE_MACOS_LOGIN_SHELL
  const savedDorkaUserDataPath = process.env.DORKA_USER_DATA_PATH

  function applyTestEnvDefaults() {
    // Why: most PTY spawn tests assert POSIX shell behavior; Windows cases opt into win32 explicitly below.
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'darwin'
    })
    // Why: forced darwin makes the TCC login(1) wrapper rewrite every asserted argv; its own test below re-enables it.
    process.env.DORKA_DISABLE_MACOS_LOGIN_SHELL = '1'
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.DORKA_OPENCODE_SOURCE_CONFIG_DIR
    delete process.env.DORKA_OPENCODE_CONFIG_DIR
    delete process.env.DORKA_AGENT_HOOK_ENDPOINT
    delete process.env.DORKA_CLAUDE_AGENT_STATUS_SETTINGS
    delete process.env.PI_CODING_AGENT_DIR
    delete process.env.DORKA_PI_SOURCE_AGENT_DIR
    delete process.env.DORKA_PI_CODING_AGENT_DIR
    delete process.env.DORKA_CODEX_HOME
    delete process.env.DORKA_OMP_SOURCE_AGENT_DIR
    delete process.env.DORKA_OMP_CODING_AGENT_DIR
    delete process.env.DORKA_OMP_STATUS_EXTENSION
    delete process.env.PRIME_AGENT_CODING_AGENT_DIR
    delete process.env.DORKA_PRIME_AGENT_SOURCE_AGENT_DIR
    delete process.env.DORKA_PRIME_AGENT_STATUS_EXTENSION
  }

  function restoreProcessEnv() {
    if (savedProcessPlatform) {
      Object.defineProperty(process, 'platform', savedProcessPlatform)
    }
    if (savedDisableMacosLoginShell !== undefined) {
      process.env.DORKA_DISABLE_MACOS_LOGIN_SHELL = savedDisableMacosLoginShell
    } else {
      delete process.env.DORKA_DISABLE_MACOS_LOGIN_SHELL
    }
    if (savedDorkaUserDataPath !== undefined) {
      process.env.DORKA_USER_DATA_PATH = savedDorkaUserDataPath
    } else {
      delete process.env.DORKA_USER_DATA_PATH
    }
    if (savedOpenCodeConfigDir !== undefined) {
      process.env.OPENCODE_CONFIG_DIR = savedOpenCodeConfigDir
    } else {
      delete process.env.OPENCODE_CONFIG_DIR
    }
    if (savedDorkaOpenCodeConfigDir !== undefined) {
      process.env.DORKA_OPENCODE_CONFIG_DIR = savedDorkaOpenCodeConfigDir
    } else {
      delete process.env.DORKA_OPENCODE_CONFIG_DIR
    }
    if (savedDorkaOpenCodeSourceConfigDir !== undefined) {
      process.env.DORKA_OPENCODE_SOURCE_CONFIG_DIR = savedDorkaOpenCodeSourceConfigDir
    } else {
      delete process.env.DORKA_OPENCODE_SOURCE_CONFIG_DIR
    }
    if (savedPiAgentDir !== undefined) {
      process.env.PI_CODING_AGENT_DIR = savedPiAgentDir
    } else {
      delete process.env.PI_CODING_AGENT_DIR
    }
    if (savedDorkaPiAgentDir !== undefined) {
      process.env.DORKA_PI_CODING_AGENT_DIR = savedDorkaPiAgentDir
    } else {
      delete process.env.DORKA_PI_CODING_AGENT_DIR
    }
    if (savedDorkaPiSourceAgentDir === undefined) {
      delete process.env.DORKA_PI_SOURCE_AGENT_DIR
    } else {
      process.env.DORKA_PI_SOURCE_AGENT_DIR = savedDorkaPiSourceAgentDir
    }
    if (savedDorkaCodexHome === undefined) {
      delete process.env.DORKA_CODEX_HOME
    } else {
      process.env.DORKA_CODEX_HOME = savedDorkaCodexHome
    }
    if (savedDorkaOmpAgentDir !== undefined) {
      process.env.DORKA_OMP_CODING_AGENT_DIR = savedDorkaOmpAgentDir
    } else {
      delete process.env.DORKA_OMP_CODING_AGENT_DIR
    }
    if (savedDorkaOmpSourceAgentDir !== undefined) {
      process.env.DORKA_OMP_SOURCE_AGENT_DIR = savedDorkaOmpSourceAgentDir
    } else {
      delete process.env.DORKA_OMP_SOURCE_AGENT_DIR
    }
    if (savedDorkaOmpStatusExtension !== undefined) {
      process.env.DORKA_OMP_STATUS_EXTENSION = savedDorkaOmpStatusExtension
    } else {
      delete process.env.DORKA_OMP_STATUS_EXTENSION
    }
    if (savedPrimeAgentDir !== undefined) {
      process.env.PRIME_AGENT_CODING_AGENT_DIR = savedPrimeAgentDir
    } else {
      delete process.env.PRIME_AGENT_CODING_AGENT_DIR
    }
    if (savedDorkaPrimeAgentSourceDir !== undefined) {
      process.env.DORKA_PRIME_AGENT_SOURCE_AGENT_DIR = savedDorkaPrimeAgentSourceDir
    } else {
      delete process.env.DORKA_PRIME_AGENT_SOURCE_AGENT_DIR
    }
    if (savedDorkaPrimeAgentStatusExtension !== undefined) {
      process.env.DORKA_PRIME_AGENT_STATUS_EXTENSION = savedDorkaPrimeAgentStatusExtension
    } else {
      delete process.env.DORKA_PRIME_AGENT_STATUS_EXTENSION
    }
    if (savedDorkaClaudeAgentStatusSettings === undefined) {
      delete process.env.DORKA_CLAUDE_AGENT_STATUS_SETTINGS
    } else {
      process.env.DORKA_CLAUDE_AGENT_STATUS_SETTINGS = savedDorkaClaudeAgentStatusSettings
    }
  }

  return { applyTestEnvDefaults, restoreProcessEnv }
}
