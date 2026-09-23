import type {
  ComputerConfigurationInput,
  ComputerConfigurationPlanResult,
  ComputerConfigurationReplaceResult,
  ComputerConfigurationSnapshot,
  ComputerDesiredState,
  ComputerRecord
} from '../../shared/computer-runtime'
import { computerConfigurationSnapshot, planComputerConfiguration } from './computer-configuration'
import type { ComputerRecordReplacement, ComputerRecordStore } from './computer-record-store'
import type { ComputerMountSourcePolicy } from './computer-mount-source-policy'
import { validateComputerId } from './computer-runtime-command'

type ComputerConfigurationHost = {
  store: ComputerRecordStore
  mountSourcePolicy: ComputerMountSourcePolicy
  runMutation: <T>(operation: () => Promise<T>) => Promise<T>
  replaceContainer: (current: ComputerRecord, next: ComputerRecord) => Promise<void>
  recoverRuntime: () => Promise<void>
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
    expectedDesiredState: ComputerDesiredState,
    configuration: ComputerConfigurationInput
  ): Promise<ComputerConfigurationPlanResult> {
    validateComputerId(id)
    const record = await this.requireRecord(id)
    if (
      record.executionGeneration !== expectedRevision ||
      record.desiredState !== expectedDesiredState
    ) {
      return { outcome: 'conflict', currentRevision: record.executionGeneration }
    }
    const planned = planComputerConfiguration(record, configuration)
    this.host.mountSourcePolicy.authorize(planned.spec)
    return { outcome: 'planned', plan: planned.plan }
  }

  replace(
    id: string,
    expectedRevision: string,
    expectedDesiredState: ComputerDesiredState,
    configuration: ComputerConfigurationInput
  ): Promise<ComputerConfigurationReplaceResult> {
    validateComputerId(id)
    return this.host.runMutation(async () => {
      let replacementEffectsStarted = false
      let replacement: ComputerRecordReplacement<void>
      try {
        const current = await this.requireRecord(id)
        if (
          current.executionGeneration === expectedRevision &&
          current.desiredState === expectedDesiredState
        ) {
          const preflight = planComputerConfiguration(current, configuration)
          this.host.mountSourcePolicy.authorize(preflight.spec)
        }
        replacement = await this.host.store.replaceSpec(
          id,
          expectedRevision,
          (storedCurrent) => {
            const planned = planComputerConfiguration(storedCurrent, configuration)
            return planned.plan.replacementRequired ? planned.spec : null
          },
          {
            expectedDesiredState,
            beforeCommit: (current, next) => {
              replacementEffectsStarted = true
              return this.host.replaceContainer(current, next)
            },
            afterCommit: async () => undefined
          }
        )
      } catch (error) {
        if (replacementEffectsStarted) {
          await this.host.recoverRuntime().catch((recoveryError: unknown) => {
            throw new AggregateError(
              [error, recoveryError],
              'Computer replacement and recovery failed'
            )
          })
        }
        throw error
      }
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
