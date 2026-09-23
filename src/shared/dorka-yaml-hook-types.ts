export type SetupRunPolicy = 'ask' | 'run-by-default' | 'skip-by-default'
export type SetupAgentStartupPolicy = 'start-immediately' | 'wait-for-setup'
export type HookCommandSourcePolicy = 'shared-only' | 'local-only' | 'run-both'

// ─── Hooks (dorka.yaml) ──────────────────────────────────────────────
export type DorkaHooks = {
  scripts: {
    setup?: string // Runs after worktree is created
    archive?: string // Runs before worktree is archived
  }
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  issueCommand?: string // Shared default command for linked GitHub issues
  defaultTabs?: DorkaDefaultTabTemplate[] // Terminal tabs to create once for a new worktree
  environmentRecipes?: DorkaVmRecipe[] // Project-scoped per-workspace environment recipes
  environmentRecipeDiagnostics?: DorkaVmRecipeDiagnostic[] // Non-fatal validation issues from environmentRecipes
  worktree?: DorkaWorktreeDefaults // Project-scoped defaults applied when a worktree is created
}

export type DorkaWorktreeDefaults = {
  // Why: shared (symlinked) rather than copied — large rebuildable dirs like
  // node_modules should be one install serving every worktree.
  sharedDirectories?: string[]
}

export type DorkaDefaultTabTemplate = {
  title?: string
  color?: string
  command?: string
}

export type EphemeralVmCheckoutMode = 'dorka-worktree' | 'provisioned-root'

export type DorkaVmRecipe = {
  id: string
  name: string
  create: string
  checkoutMode?: EphemeralVmCheckoutMode
  description?: string
  suspend?: string
  resume?: string
  destroy?: string
  destroyDisabled?: boolean
}

export type DorkaVmRecipeDiagnostic = {
  index: number
  field?: string
  message: string
}

export type RepoHookSettings = {
  // Why: persisted data may still include the old mode field from the earlier
  // hook UI. Keep it in the shape so existing local state reads without a migration.
  mode: 'auto' | 'override'
  setupRunPolicy?: SetupRunPolicy
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  commandSourcePolicy?: HookCommandSourcePolicy
  scripts: {
    setup: string
    archive: string
  }
}

export type PersistedTrustedDorkaHookEntry = {
  contentHash: string
  approvedAt: number
}

export type PersistedTrustedDorkaHookRepo = {
  all?: {
    approvedAt: number
  }
  setup?: PersistedTrustedDorkaHookEntry
  archive?: PersistedTrustedDorkaHookEntry
  issueCommand?: PersistedTrustedDorkaHookEntry
  vmRecipe?: PersistedTrustedDorkaHookEntry
}

export type PersistedTrustedDorkaHooks = Record<string, PersistedTrustedDorkaHookRepo>
