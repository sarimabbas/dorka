import type {
  ComputerConfigurationInput,
  ComputerConfigurationPlanResult,
  ComputerConfigurationReplaceResult,
  ComputerConfigurationSnapshot,
  ComputerRecord
} from '../../shared/computer-runtime'
import { computerConfigurationSnapshot, planComputerConfiguration } from './computer-configuration'
import type { ComputerRecordStore } from './computer-record-store'
import { validateComputerId } from './computer-runtime-command'

type ComputerConfigurationHost = {
  store: ComputerRecordStore
  allowedMountSources: readonly string[]
  runMutation: <T>(operation: () => Promise<T>) => Promise<T>
  replaceContainer: (current: ComputerRecord, next: ComputerRecord) => Promise<void>
}

export class ComputerConfigurationService {
  constructor(private readonly host: ComputerConfigurationHost) {}

  async get(id: string): Promise<ComputerConfigurationSnapshot> {
    validateComputerId(id)
    return computerConfigurationSnapshot(await this.requireRecord(id))
  }

  async plan(
    id: string,
    expectedRevision: string,
    configuration: ComputerConfigurationInput
  ): Promise<ComputerConfigurationPlanResult> {
    validateComputerId(id)
    const record = await this.requireRecord(id)
    if (record.executionGeneration !== expectedRevision) {
      return { outcome: 'conflict', currentRevision: record.executionGeneration }
    }
    return {
      outcome: 'planned',
      plan: planComputerConfiguration(record, configuration, this.host.allowedMountSources).plan
    }
  }

  replace(
    id: string,
    expectedRevision: string,
    configuration: ComputerConfigurationInput
  ): Promise<ComputerConfigurationReplaceResult> {
    validateComputerId(id)
    return this.host.runMutation(async () => {
      const replacement = await this.host.store.replaceSpec(
        id,
        expectedRevision,
        (current) => {
          const planned = planComputerConfiguration(
            current,
            configuration,
            this.host.allowedMountSources
          )
          return planned.plan.replacementRequired ? planned.spec : null
        },
        {
          beforeCommit: (current, next) => this.host.replaceContainer(current, next),
          afterCommit: async () => undefined
        }
      )
      if (replacement.kind === 'conflict') {
        return { outcome: 'conflict', currentRevision: replacement.currentRevision }
      }
      return {
        outcome: replacement.kind === 'replaced' ? 'replaced' : 'unchanged',
        snapshot: computerConfigurationSnapshot(replacement.record)
      }
    })
  }

  private async requireRecord(id: string): Promise<ComputerRecord> {
    const record = await this.host.store.get(id)
    if (!record) {
      throw new Error(`Unknown Computer: ${id}`)
    }
    return record
  }
}
