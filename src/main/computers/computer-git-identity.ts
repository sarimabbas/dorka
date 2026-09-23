import type {
  ComputerGitIdentity,
  ComputerGitIdentityInput
} from '../../shared/computer-git-identity'
import { assertValidComputerGitIdentity } from '../../shared/computer-git-identity'
import type { ManagedComputerHostProjector } from '../agents/managed-computer-host-projector'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { SshGitProvider } from '../providers/ssh-git-provider'
import type { ComputerRuntimeManager } from './computer-runtime-manager'

const RUNNING_REQUIRED = 'Start this Computer before managing its Git identity.'

type ComputerIdentityGitProvider = Pick<
  SshGitProvider,
  'getComputerGitIdentity' | 'setComputerGitIdentity'
>

type ComputerGitIdentityOptions = {
  computers: Pick<ComputerRuntimeManager, 'inspect'>
  host: ManagedComputerHostProjector
  getGitProvider?: (targetId: string) => ComputerIdentityGitProvider | undefined
}

export type ComputerGitIdentityService = Pick<ComputerGitIdentityManager, 'get' | 'set'>

export class ComputerGitIdentityManager {
  private readonly getGitProvider: (targetId: string) => ComputerIdentityGitProvider | undefined

  constructor(private readonly options: ComputerGitIdentityOptions) {
    this.getGitProvider = options.getGitProvider ?? getSshGitProvider
  }

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
      const target = await this.options.host.connect(computerId)
      const provider = this.getGitProvider(target.id)
      if (!provider) {
        throw new Error('provider unavailable')
      }
      return provider
    } catch {
      throw new Error('Could not access this Computer’s Git identity.')
    }
  }
}
