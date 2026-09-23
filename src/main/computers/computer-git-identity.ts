import type {
  ComputerGitIdentity,
  ComputerGitIdentityInput
} from '../../shared/computer-git-identity'
import { assertValidComputerGitIdentity } from '../../shared/computer-git-identity'
import type {
  ManagedComputerGitCapability,
  ManagedComputerHostProjector
} from '../agents/managed-computer-host-projector'
import type { ComputerRuntimeManager } from './computer-runtime-manager'

const RUNNING_REQUIRED = 'Start this Computer before managing its Git identity.'

type ComputerIdentityGitProvider = Pick<
  ManagedComputerGitCapability,
  'getComputerGitIdentity' | 'setComputerGitIdentity'
>

type ComputerGitIdentityOptions = {
  computers: Pick<ComputerRuntimeManager, 'inspect'>
  host: ManagedComputerHostProjector
}

export type ComputerGitIdentityService = Pick<ComputerGitIdentityManager, 'get' | 'set'>

export class ComputerGitIdentityManager {
  constructor(private readonly options: ComputerGitIdentityOptions) {}

  async get(computerId: string): Promise<ComputerGitIdentity> {
    const provider = await this.resolveProvider(computerId)
    try {
      return await provider.getComputerGitIdentity()
    } catch {
      throw new Error('Could not read this Computer’s Git identity.')
    }
  }

  async set(computerId: string, identity: ComputerGitIdentityInput): Promise<ComputerGitIdentity> {
    assertValidComputerGitIdentity(identity)
    const provider = await this.resolveProvider(computerId)
    try {
      return await provider.setComputerGitIdentity(identity)
    } catch {
      throw new Error('Could not save this Computer’s Git identity.')
    }
  }

  private async resolveProvider(computerId: string): Promise<ComputerIdentityGitProvider> {
    let state: string
    try {
      state = (await this.options.computers.inspect(computerId)).state
    } catch {
      throw new Error('Could not access this Computer’s Git identity.')
    }
    if (state !== 'running') {
      throw new Error(RUNNING_REQUIRED)
    }

    try {
      const connection = await this.options.host.connect(computerId)
      const provider = connection.git
      if (!provider) {
        throw new Error('provider unavailable')
      }
      return provider
    } catch {
      throw new Error('Could not access this Computer’s Git identity.')
    }
  }
}
