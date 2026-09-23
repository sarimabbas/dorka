import type {
  ComputerConfigurationInput,
  ComputerConfigurationSnapshot,
  ComputerMountSpec
} from '../../../../shared/computer-runtime'

export type EnvironmentDraft = { id: number; name: string; value: string }
export type ComputerConfigurationDraft = {
  resources: ComputerConfigurationInput['resources']
  preserve: Set<string>
  environment: EnvironmentDraft[]
  premounts: Required<ComputerMountSpec>[]
}

export function computerConfigurationDraft(
  snapshot: ComputerConfigurationSnapshot
): ComputerConfigurationDraft {
  return {
    resources: { ...snapshot.configuration.resources },
    preserve: new Set(snapshot.configuration.environment),
    environment: [],
    premounts: snapshot.configuration.premounts.map((mount) => ({ ...mount }))
  }
}

export function computerConfigurationRequest(
  draft: ComputerConfigurationDraft
): ComputerConfigurationInput {
  return {
    resources: draft.resources,
    environment: {
      preserve: [...draft.preserve].sort(),
      set: Object.fromEntries(
        draft.environment
          .filter(({ name }) => name.trim().length > 0)
          .map(({ name, value }) => [name.trim(), value])
      )
    },
    premounts: draft.premounts
  }
}
