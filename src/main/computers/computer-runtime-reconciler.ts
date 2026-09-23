import type {
  ComputerReconcileResult,
  ComputerRecord,
  ComputerRuntimeInfo
} from '../../shared/computer-runtime'
import { computerName } from './computer-runtime-command'

export type OwnedComputer = {
  info: ComputerRuntimeInfo
  executionGeneration: string | undefined
}

type ComputerReconcileHost = {
  desired: ComputerRecord[]
  actual: OwnedComputer[]
  remove: (name: string) => Promise<void>
  create: (record: ComputerRecord) => Promise<void>
  start: (name: string) => Promise<void>
  stop: (name: string) => Promise<void>
}

export async function reconcileComputerState(
  host: ComputerReconcileHost
): Promise<ComputerReconcileResult> {
  const actualById = new Map(host.actual.map((computer) => [computer.info.id, computer]))
  const desiredById = new Map(host.desired.map((record) => [record.spec.id, record]))
  const result: ComputerReconcileResult = { created: [], started: [], stopped: [], removed: [] }

  for (const record of host.desired) {
    let current = actualById.get(record.spec.id)
    if (current && current.executionGeneration !== record.executionGeneration) {
      await host.remove(current.info.name)
      current = undefined
    }
    if (!current) {
      await host.create(record)
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
      await host.start(current.info.name)
      result.started.push(record.spec.id)
    } else if (record.desiredState === 'stopped' && current.info.state === 'running') {
      await host.stop(current.info.name)
      result.stopped.push(record.spec.id)
    }
  }

  for (const computer of host.actual) {
    if (!desiredById.has(computer.info.id)) {
      await host.remove(computer.info.name)
      result.removed.push(computer.info.id)
    }
  }
  return result
}
