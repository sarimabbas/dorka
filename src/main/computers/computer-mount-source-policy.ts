import type { ComputerCreateSpec } from '../../shared/computer-runtime'
import {
  validateAllowedMountSources,
  validateComputerSpecWithAllowedMountSources,
  type ValidatedComputerCreateSpec
} from './computer-runtime-command'

export class ComputerMountSourcePolicy {
  private constructor(private readonly allowedSources: readonly string[]) {}

  static create(configuredSources: readonly string[]): ComputerMountSourcePolicy {
    return new ComputerMountSourcePolicy(validateAllowedMountSources(configuredSources))
  }

  static denyAll(): ComputerMountSourcePolicy {
    return new ComputerMountSourcePolicy([])
  }

  authorize(spec: ComputerCreateSpec): ValidatedComputerCreateSpec {
    return validateComputerSpecWithAllowedMountSources(spec, this.allowedSources)
  }

  get sources(): readonly string[] {
    return this.allowedSources
  }
}
