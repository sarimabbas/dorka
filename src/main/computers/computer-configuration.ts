import type {
  ComputerConfigurationChanges,
  ComputerConfigurationInput,
  ComputerConfigurationPlan,
  ComputerConfigurationSnapshot,
  ComputerCreateSpec,
  ComputerRecord,
  RedactedComputerConfiguration
} from '../../shared/computer-runtime'
import {
  validateComputerSpec,
  validateComputerSpecWithAllowedMountSources,
  type ValidatedComputerCreateSpec
} from './computer-runtime-command'

export type PlannedComputerConfiguration = {
  spec: ValidatedComputerCreateSpec
  plan: ComputerConfigurationPlan
}

export function computerConfigurationSnapshot(
  record: ComputerRecord
): ComputerConfigurationSnapshot {
  return {
    id: record.spec.id,
    revision: record.executionGeneration,
    desiredState: record.desiredState,
    configuration: redactConfiguration(validateComputerSpec(record.spec))
  }
}

export function planComputerConfiguration(
  record: ComputerRecord,
  input: ComputerConfigurationInput,
  allowedMountSources: readonly string[]
): PlannedComputerConfiguration {
  const current = validateComputerSpec(record.spec)
  const spec = materializeComputerConfiguration(record.spec, input, allowedMountSources)
  const changes = configurationChanges(current, spec)
  const replacementRequired = hasChanges(changes)
  return {
    spec,
    plan: {
      id: record.spec.id,
      revision: record.executionGeneration,
      desiredState: record.desiredState,
      configuration: redactConfiguration(spec),
      replacementRequired,
      interruption: replacementRequired && record.desiredState === 'running' ? 'restart' : 'none',
      changes
    }
  }
}

export function materializeComputerConfiguration(
  current: ComputerCreateSpec,
  input: ComputerConfigurationInput,
  allowedMountSources: readonly string[]
): ValidatedComputerCreateSpec {
  const preserve = input.environment.preserve
  const set = input.environment.set
  if (new Set(preserve).size !== preserve.length) {
    throw new Error('Computer environment preserve names must be unique')
  }
  for (const name of preserve) {
    if (Object.hasOwn(set, name)) {
      throw new Error(`Computer environment variable cannot be preserved and set: ${name}`)
    }
    if (!Object.hasOwn(current.environment ?? {}, name)) {
      throw new Error(
        `Computer environment variable cannot be preserved because it is absent: ${name}`
      )
    }
  }
  const environment = Object.fromEntries([
    ...preserve.map((name) => [name, current.environment?.[name] ?? ''] as const),
    ...Object.entries(set)
  ])
  return validateComputerSpecWithAllowedMountSources(
    {
      id: current.id,
      image: current.image,
      resources: input.resources,
      environment,
      mounts: input.premounts
    },
    allowedMountSources
  )
}

function redactConfiguration(spec: ValidatedComputerCreateSpec): RedactedComputerConfiguration {
  return {
    resources: { ...spec.resources },
    environment: Object.keys(spec.environment).sort(),
    premounts: spec.mounts.map((mount) => ({ ...mount }))
  }
}

function configurationChanges(
  current: ValidatedComputerCreateSpec,
  next: ValidatedComputerCreateSpec
): ComputerConfigurationChanges {
  const resourceKeys = ['cpus', 'memoryMb', 'pids'] as const
  const resources = resourceKeys.filter((key) => current.resources[key] !== next.resources[key])
  const currentNames = Object.keys(current.environment)
  const nextNames = Object.keys(next.environment)
  const currentNameSet = new Set(currentNames)
  const nextNameSet = new Set(nextNames)
  return {
    resources,
    environment: {
      added: nextNames.filter((name) => !currentNameSet.has(name)).sort(),
      changed: nextNames
        .filter(
          (name) => currentNameSet.has(name) && current.environment[name] !== next.environment[name]
        )
        .sort(),
      removed: currentNames.filter((name) => !nextNameSet.has(name)).sort()
    },
    premountsChanged: JSON.stringify(current.mounts) !== JSON.stringify(next.mounts)
  }
}

function hasChanges(changes: ComputerConfigurationChanges): boolean {
  return (
    changes.resources.length > 0 ||
    changes.environment.added.length > 0 ||
    changes.environment.changed.length > 0 ||
    changes.environment.removed.length > 0 ||
    changes.premountsChanged
  )
}
