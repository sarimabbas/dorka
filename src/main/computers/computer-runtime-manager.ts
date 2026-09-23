import {
  runProcess,
  type ProcessResult,
  type ProcessSpec
} from '../../shared/child-process/run-process'
import {
  DORKA_COMPUTER_LABEL,
  DORKA_MANAGED_LABEL,
  DORKA_SERVER_LABEL,
  type ComputerCreateSpec,
  type ComputerDesiredState,
  type ComputerReconcileResult,
  type ComputerRecord,
  type ComputerRuntimeInfo,
  type ComputerRuntimeState
} from '../../shared/computer-runtime'
import { ComputerRecordStore } from './computer-record-store'
import {
  computerName,
  createComputerArgs,
  listComputerIdsArgs,
  validateComputerId,
  validateComputerSpec,
  validateServerId
} from './computer-runtime-command'

export type ComputerCommandExecutor = (spec: ProcessSpec) => Promise<ProcessResult>

export type ComputerRuntimeManagerOptions = {
  dataDirectory: string
  serverId: string
  enginePath?: string
  execute?: ComputerCommandExecutor
}

type DockerInspection = {
  Id: string
  Name: string
  Config: { Image: string; Labels: Record<string, string> }
  State: { Running: boolean; Status: string }
}

export class ComputerRuntimeManager {
  private readonly enginePath: string
  private readonly execute: ComputerCommandExecutor
  private readonly store: ComputerRecordStore

  constructor(private readonly options: ComputerRuntimeManagerOptions) {
    validateServerId(options.serverId)
    this.enginePath = options.enginePath ?? 'docker'
    this.execute = options.execute ?? runProcess
    this.store = new ComputerRecordStore(options.dataDirectory)
  }

  async create(spec: ComputerCreateSpec): Promise<ComputerRuntimeInfo> {
    const validated = validateComputerSpec(spec)
    const records = await this.store.load()
    if (records.some((record) => record.spec.id === validated.id)) {
      throw new Error(`Computer already exists: ${validated.id}`)
    }

    await this.run(createComputerArgs(validated, this.options.serverId))
    await this.store.save([...records, { spec: validated, desiredState: 'stopped' }])
    return this.inspect(validated.id)
  }

  async start(id: string): Promise<ComputerRuntimeInfo> {
    await this.requireDesired(id)
    await this.inspect(id)
    await this.run(['start', computerName(id)])
    await this.setDesiredState(id, 'running')
    return this.inspect(id)
  }

  async stop(id: string): Promise<ComputerRuntimeInfo> {
    await this.requireDesired(id)
    await this.inspect(id)
    await this.run(['stop', computerName(id)])
    await this.setDesiredState(id, 'stopped')
    return this.inspect(id)
  }

  async remove(id: string): Promise<void> {
    await this.requireDesired(id)
    await this.inspect(id)
    await this.run(['rm', '--force', computerName(id)])
    const records = await this.store.load()
    await this.store.save(records.filter((record) => record.spec.id !== id))
  }

  async inspect(id: string): Promise<ComputerRuntimeInfo> {
    validateComputerId(id)
    const inspection = await this.inspectReference(computerName(id))
    return this.toRuntimeInfo(inspection, id)
  }

  async list(): Promise<ComputerRuntimeInfo[]> {
    const result = await this.run(listComputerIdsArgs(this.options.serverId))
    const engineIds = result.stdout.split(/\s+/).filter(Boolean)
    if (engineIds.length === 0) {
      return []
    }
    const inspections = await this.inspectReferences(engineIds)
    return inspections.flatMap((inspection) => {
      const id = inspection.Config.Labels[DORKA_COMPUTER_LABEL]
      if (!id) {
        return []
      }
      try {
        return [this.toRuntimeInfo(inspection, id)]
      } catch {
        return []
      }
    })
  }

  async reconcile(): Promise<ComputerReconcileResult> {
    const desired = await this.store.load()
    const actual = await this.list()
    const actualById = new Map(actual.map((computer) => [computer.id, computer]))
    const desiredById = new Map(desired.map((record) => [record.spec.id, record]))
    const result: ComputerReconcileResult = { created: [], started: [], stopped: [], removed: [] }

    for (const record of desired) {
      let current = actualById.get(record.spec.id)
      if (!current) {
        await this.run(createComputerArgs(record.spec, this.options.serverId))
        result.created.push(record.spec.id)
        current = {
          id: record.spec.id,
          name: computerName(record.spec.id),
          image: record.spec.image,
          state: 'created'
        }
      }
      if (record.desiredState === 'running' && current.state !== 'running') {
        await this.run(['start', current.name])
        result.started.push(record.spec.id)
      } else if (record.desiredState === 'stopped' && current.state === 'running') {
        await this.run(['stop', current.name])
        result.stopped.push(record.spec.id)
      }
    }

    for (const computer of actual) {
      if (desiredById.has(computer.id)) {
        continue
      }
      await this.run(['rm', '--force', computer.name])
      result.removed.push(computer.id)
    }
    return result
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

  private async inspectReference(reference: string): Promise<DockerInspection> {
    const inspections = await this.inspectReferences([reference])
    if (inspections.length !== 1) {
      throw new Error(`Expected one Computer inspection for ${reference}`)
    }
    return inspections[0]
  }

  private async inspectReferences(references: string[]): Promise<DockerInspection[]> {
    const result = await this.run(['inspect', ...references])
    const value: unknown = JSON.parse(result.stdout)
    if (!Array.isArray(value) || !value.every(isDockerInspection)) {
      throw new Error('Docker-compatible CLI returned an invalid inspection')
    }
    return value
  }

  private toRuntimeInfo(inspection: DockerInspection, expectedId: string): ComputerRuntimeInfo {
    validateComputerId(expectedId)
    const labels = inspection.Config.Labels
    if (
      labels[DORKA_MANAGED_LABEL] !== 'true' ||
      labels[DORKA_SERVER_LABEL] !== this.options.serverId ||
      labels[DORKA_COMPUTER_LABEL] !== expectedId ||
      inspection.Name.replace(/^\//, '') !== computerName(expectedId)
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

  private async run(args: string[]): Promise<ProcessResult> {
    const result = await this.execute({ program: this.enginePath, args })
    if (result.code !== 0 || result.timedOut) {
      const detail = result.stderr.trim() || `exit code ${String(result.code)}`
      throw new Error(`Computer runtime command failed: ${detail}`)
    }
    return result
  }
}

function parseRuntimeState(state: DockerInspection['State']): ComputerRuntimeState {
  if (state.Running) {
    return 'running'
  }
  return state.Status === 'created' ? 'created' : 'stopped'
}

function isDockerInspection(value: unknown): value is DockerInspection {
  if (!value || typeof value !== 'object') {
    return false
  }
  if (!('Id' in value) || typeof value.Id !== 'string') {
    return false
  }
  if (!('Name' in value) || typeof value.Name !== 'string') {
    return false
  }
  if (!('Config' in value) || !value.Config || typeof value.Config !== 'object') {
    return false
  }
  if (!('Image' in value.Config) || typeof value.Config.Image !== 'string') {
    return false
  }
  if (!('Labels' in value.Config) || !isStringRecord(value.Config.Labels)) {
    return false
  }
  if (!('State' in value) || !value.State || typeof value.State !== 'object') {
    return false
  }
  return (
    'Running' in value.State &&
    typeof value.State.Running === 'boolean' &&
    'Status' in value.State &&
    typeof value.State.Status === 'string'
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}
