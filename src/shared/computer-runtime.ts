export const DORKA_COMPUTER_NETWORK = 'dorka-runtimes'
export const DORKA_MANAGED_LABEL = 'dev.dorka.managed'
export const DORKA_SERVER_LABEL = 'dev.dorka.server'
export const DORKA_COMPUTER_LABEL = 'dev.dorka.computer'
export const DORKA_EXECUTION_GENERATION_LABEL = 'dev.dorka.execution-generation'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isComputerExecutionGeneration(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export type ComputerResourceLimits = {
  cpus?: number
  memoryMb?: number
  pids?: number
}

export type ComputerMountSpec = {
  source: string
  target: string
  readOnly?: boolean
}

export type ComputerCreateSpec = {
  id: string
  image: string
  resources?: ComputerResourceLimits
  environment?: Record<string, string>
  mounts?: ComputerMountSpec[]
}

export type ComputerConfigurationInput = {
  resources: Required<ComputerResourceLimits>
  environment: {
    preserve: string[]
    set: Record<string, string>
  }
  premounts: ComputerMountSpec[]
}

export type RedactedComputerConfiguration = {
  resources: Required<ComputerResourceLimits>
  environment: string[]
  premounts: Required<ComputerMountSpec>[]
}

export type ComputerConfigurationSnapshot = {
  id: string
  revision: string
  configuration: RedactedComputerConfiguration
}

export type ComputerConfigurationChanges = {
  resources: (keyof ComputerResourceLimits)[]
  environment: {
    added: string[]
    changed: string[]
    removed: string[]
  }
  premountsChanged: boolean
}

export type ComputerConfigurationPlan = ComputerConfigurationSnapshot & {
  replacementRequired: boolean
  interruption: 'none' | 'restart'
  changes: ComputerConfigurationChanges
}

export type ComputerConfigurationConflict = {
  outcome: 'conflict'
  currentRevision: string
}

export type ComputerConfigurationPlanResult =
  | ComputerConfigurationConflict
  | { outcome: 'planned'; plan: ComputerConfigurationPlan }

export type ComputerConfigurationReplaceResult =
  | ComputerConfigurationConflict
  | {
      outcome: 'unchanged' | 'replaced'
      snapshot: ComputerConfigurationSnapshot
    }

export type ComputerDesiredState = 'stopped' | 'running'
export type ComputerRuntimeState = 'created' | 'running' | 'stopped'

export type ComputerRecord = {
  spec: ComputerCreateSpec
  desiredState: ComputerDesiredState
  executionGeneration: string
}

export type ComputerRuntimeInfo = {
  id: string
  name: string
  image: string
  state: ComputerRuntimeState
}

export type ComputerReconcileResult = {
  created: string[]
  started: string[]
  stopped: string[]
  removed: string[]
}
