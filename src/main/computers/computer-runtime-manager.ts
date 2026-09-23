import { randomUUID } from 'node:crypto'
import {
  runProcess,
  type ProcessResult,
  type ProcessSpec
} from '../../shared/child-process/run-process'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_EXECUTION_GENERATION_LABEL,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL,
  type ComputerCreateSpec,
  type ComputerDesiredState,
  type ComputerReconcileResult,
  type ComputerRecord,
  type ComputerRuntimeInfo,
  type ComputerRuntimeState
} from '../../shared/computer-runtime'
import {
  isComputerEngineInspection,
  type ComputerEngineInspection
} from './computer-engine-inspection'
import { ComputerRecordStore } from './computer-record-store'
import { ComputerSshKeyStore } from './computer-ssh-key-store'
import {
  computerName,
  createComputerArgs,
  listComputerIdsArgs,
  validateAllowedMountSources,
  validateComputerId,
  validateComputerSpec,
  validateServerId
} from './computer-runtime-command'

export type ComputerCommandExecutor = (spec: ProcessSpec) => Promise<ProcessResult>

export type ComputerRuntimeManagerOptions = {
  dataDirectory: string
  serverId: string
  enginePath?: string
  allowedMountSources?: readonly string[]
  execute?: ComputerCommandExecutor
}

export class ComputerRuntimeManager {
  private readonly enginePath: string
  private readonly execute: ComputerCommandExecutor
  private readonly store: ComputerRecordStore
  private readonly sshKeys: ComputerSshKeyStore
  private readonly allowedMountSources: readonly string[]
  private mutationQueue = Promise.resolve()

  constructor(private readonly options: ComputerRuntimeManagerOptions) {
    validateServerId(options.serverId)
    this.enginePath = options.enginePath ?? 'docker'
    this.execute = options.execute ?? runProcess
    this.allowedMountSources = validateAllowedMountSources(options.allowedMountSources ?? [])
    this.store = new ComputerRecordStore(options.dataDirectory)
    this.sshKeys = new ComputerSshKeyStore(options.dataDirectory)
  }

  create(spec: ComputerCreateSpec): Promise<ComputerRuntimeInfo> {
    return this.runMutation(() => this.createNow(spec))
  }

  private async createNow(spec: ComputerCreateSpec): Promise<ComputerRuntimeInfo> {
    const validated = validateComputerSpec(spec)
    const records = await this.store.load()
    if (records.some((record) => record.spec.id === validated.id)) {
      throw new Error(`Computer already exists: ${validated.id}`)
    }

    const record: ComputerRecord = {
      spec: validated,
      desiredState: 'stopped',
      executionGeneration: randomUUID()
    }
    await this.createContainer(record)
    await this.store.save([...records, record])
    return this.inspect(validated.id)
  }

  start(id: string): Promise<ComputerRuntimeInfo> {
    return this.runMutation(() => this.startNow(id))
  }

  private async startNow(id: string): Promise<ComputerRuntimeInfo> {
    await this.requireDesired(id)
    await this.inspect(id)
    await this.run(['start', computerName(id)])
    await this.setDesiredState(id, 'running')
    return this.inspect(id)
  }

  stop(id: string): Promise<ComputerRuntimeInfo> {
    return this.runMutation(() => this.stopNow(id))
  }

  private async stopNow(id: string): Promise<ComputerRuntimeInfo> {
    await this.requireDesired(id)
    await this.inspect(id)
    await this.run(['stop', computerName(id)])
    await this.setDesiredState(id, 'stopped')
    return this.inspect(id)
  }

  remove(id: string): Promise<void> {
    return this.runMutation(() => this.removeNow(id))
  }

  private async removeNow(id: string): Promise<void> {
    await this.requireDesired(id)
    await this.inspect(id)
    await this.run(['rm', '--force', computerName(id)])
    const records = await this.store.load()
    await this.store.save(records.filter((record) => record.spec.id !== id))
  }

  async inspect(id: string): Promise<ComputerRuntimeInfo> {
    const record = await this.requireDesired(id)
    const inspection = await this.inspectReference(computerName(id))
    return this.toRuntimeInfo(inspection, id, record.executionGeneration)
  }

  async getExecutionGeneration(id: string): Promise<string> {
    return (await this.requireDesired(id)).executionGeneration
  }

  resolveSshIdentityFile(id: string): Promise<string> {
    return this.sshKeys.resolvePrivateKeyPath(id)
  }

  async list(): Promise<ComputerRuntimeInfo[]> {
    const records = await this.store.load()
    const desiredById = new Map(records.map((record) => [record.spec.id, record]))
    return (await this.listOwnedComputers()).flatMap(({ info, executionGeneration }) => {
      const desired = desiredById.get(info.id)
      return desired?.executionGeneration === executionGeneration ? [info] : []
    })
  }

  reconcile(): Promise<ComputerReconcileResult> {
    return this.runMutation(() => this.reconcileNow())
  }

  private async reconcileNow(): Promise<ComputerReconcileResult> {
    const desired = await this.store.load()
    const actual = await this.listOwnedComputers()
    const actualById = new Map(actual.map((computer) => [computer.info.id, computer]))
    const desiredById = new Map(desired.map((record) => [record.spec.id, record]))
    const result: ComputerReconcileResult = { created: [], started: [], stopped: [], removed: [] }

    for (const record of desired) {
      let current = actualById.get(record.spec.id)
      if (current && current.executionGeneration !== record.executionGeneration) {
        await this.run(['rm', '--force', current.info.name])
        current = undefined
      }
      if (!current) {
        await this.createContainer(record)
        result.created.push(record.spec.id)
        current = {
          info: {
            id: record.spec.id,
            name: computerName(record.spec.id),
            image: record.spec.image,
            state: 'created'
          },
          executionGeneration: record.executionGeneration
        }
      }
      if (record.desiredState === 'running' && current.info.state !== 'running') {
        await this.run(['start', current.info.name])
        result.started.push(record.spec.id)
      } else if (record.desiredState === 'stopped' && current.info.state === 'running') {
        await this.run(['stop', current.info.name])
        result.stopped.push(record.spec.id)
      }
    }

    for (const computer of actual) {
      if (desiredById.has(computer.info.id)) {
        continue
      }
      await this.run(['rm', '--force', computer.info.name])
      result.removed.push(computer.info.id)
    }
    return result
  }

  private async createContainer(record: ComputerRecord): Promise<void> {
    const publicKey = await this.sshKeys.loadOrCreatePublicKey(record.spec.id)
    await this.run(
      createComputerArgs(
        record.spec,
        this.options.serverId,
        publicKey,
        record.executionGeneration,
        this.allowedMountSources
      )
    )
  }

  private async requireDesired(id: string): Promise<ComputerRecord> {
    validateComputerId(id)
    const record = (await this.store.load()).find((candidate) => candidate.spec.id === id)
    if (!record) {
      throw new Error(`Unknown Computer: ${id}`)
    }
    return record
  }

  private async setDesiredState(id: string, desiredState: ComputerDesiredState): Promise<void> {
    const records = await this.store.load()
    await this.store.save(
      records.map((record) => (record.spec.id === id ? { ...record, desiredState } : record))
    )
  }

  private async inspectReference(reference: string): Promise<ComputerEngineInspection> {
    const inspections = await this.inspectReferences([reference])
    if (inspections.length !== 1) {
      throw new Error(`Expected one Computer inspection for ${reference}`)
    }
    return inspections[0]
  }

  private async inspectReferences(references: string[]): Promise<ComputerEngineInspection[]> {
    const result = await this.run(['inspect', ...references])
    const value: unknown = JSON.parse(result.stdout)
    if (!Array.isArray(value) || !value.every(isComputerEngineInspection)) {
      throw new Error('Docker-compatible CLI returned an invalid inspection')
    }
    return value
  }

  private async listOwnedComputers(): Promise<
    { info: ComputerRuntimeInfo; executionGeneration: string | undefined }[]
  > {
    const result = await this.run(listComputerIdsArgs(this.options.serverId))
    const engineIds = result.stdout.split(/\s+/).filter(Boolean)
    if (engineIds.length === 0) {
      return []
    }
    return (await this.inspectReferences(engineIds)).flatMap((inspection) => {
      const id = inspection.Config.Labels[DORKA_COMPUTER_LABEL]
      if (!id) {
        return []
      }
      try {
        return [
          {
            info: this.toRuntimeInfo(inspection, id),
            executionGeneration: inspection.Config.Labels[DORKA_EXECUTION_GENERATION_LABEL]
          }
        ]
      } catch {
        return []
      }
    })
  }

  private toRuntimeInfo(
    inspection: ComputerEngineInspection,
    expectedId: string,
    expectedExecutionGeneration?: string
  ): ComputerRuntimeInfo {
    validateComputerId(expectedId)
    const labels = inspection.Config.Labels
    if (
      labels[DORKA_MANAGED_LABEL] !== 'true' ||
      labels[DORKA_SERVER_LABEL] !== this.options.serverId ||
      labels[DORKA_COMPUTER_LABEL] !== expectedId ||
      inspection.Name.replace(/^\//, '') !== computerName(expectedId) ||
      (expectedExecutionGeneration !== undefined &&
        labels[DORKA_EXECUTION_GENERATION_LABEL] !== expectedExecutionGeneration)
    ) {
      throw new Error(`Container is not owned by this Dorka server: ${expectedId}`)
    }
    return {
      id: expectedId,
      name: computerName(expectedId),
      image: inspection.Config.Image,
      state: parseRuntimeState(inspection.State)
    }
  }

  private runMutation<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.mutationQueue.then(operation)
    this.mutationQueue = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }

  private async run(args: string[]): Promise<ProcessResult> {
    const result = await this.execute({ program: this.enginePath, args })
    if (result.code !== 0 || result.timedOut) {
      const detail = result.stderr.trim() || `exit code ${String(result.code)}`
      throw new Error(`Computer runtime command failed: ${detail}`)
    }
    return result
  }
}

function parseRuntimeState(state: ComputerEngineInspection['State']): ComputerRuntimeState {
  if (state.Running) {
    return 'running'
  }
  return state.Status === 'created' ? 'created' : 'stopped'
}
