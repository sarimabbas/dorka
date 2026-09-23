import type { SkillInstallDestination } from '../../shared/skill-install-contract'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'

export async function classifySkillCloudInstallTarget(
  runtime: DorkaRuntimeService,
  input: { environmentId?: string; destination: SkillInstallDestination }
): Promise<'local' | 'remote'> {
  return input.environmentId || (await runtime.skillInstallDestinationUsesSsh(input.destination))
    ? 'remote'
    : 'local'
}
