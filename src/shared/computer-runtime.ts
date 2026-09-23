export const DORKA_COMPUTER_NETWORK = 'dorka-runtimes'
export const DORKA_MANAGED_LABEL = 'dev.dorka.managed'
export const DORKA_SERVER_LABEL = 'dev.dorka.server'
export const DORKA_COMPUTER_LABEL = 'dev.dorka.computer'

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

export type ComputerDesiredState = 'stopped' | 'running'
export type ComputerRuntimeState = 'created' | 'running' | 'stopped'

export type ComputerRecord = {
  spec: ComputerCreateSpec
  desiredState: ComputerDesiredState
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
