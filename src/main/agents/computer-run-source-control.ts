import { posix } from 'node:path'
import type {
  AgentSourceControlDiffRequest,
  AgentSourceControlReviewDiffRequest,
  AgentSourceControlReviewRequest
} from '../../shared/rpc-contract/agent-source-control-params'
import type { AgentRosterStore } from './agent-roster-store'
import {
  COMPUTER_WORKSPACE,
  type ManagedComputerHostProjector
} from './managed-computer-host-projector'
import type { ComputerRuntimeManager } from '../computers/computer-runtime-manager'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { IGitProvider } from '../providers/types'

const SOURCE_CONTROL_UNVERIFIABLE = 'Computer source control is unverifiable'

type ComputerSourceControlGitProvider = Pick<
  IGitProvider,
  'getStatus' | 'getDiff' | 'getBranchCompare' | 'getBranchDiff' | 'isGitRepoAsync'
>

type ComputerRunSourceControlOptions = {
  roster: Pick<AgentRosterStore, 'getRun'>
  computers: Pick<ComputerRuntimeManager, 'inspect' | 'start'>
  host: ManagedComputerHostProjector
  getGitProvider?: (targetId: string) => ComputerSourceControlGitProvider | undefined
}

export type ComputerRunSourceControlService = Pick<
  ComputerRunSourceControl,
  'status' | 'diff' | 'review' | 'reviewDiff'
>

export class ComputerRunSourceControl {
  private readonly getGitProvider: (
    targetId: string
  ) => ComputerSourceControlGitProvider | undefined

  constructor(private readonly options: ComputerRunSourceControlOptions) {
    this.getGitProvider = options.getGitProvider ?? getSshGitProvider
  }

  async status(runId: string) {
    const { provider, repoRoot } = await this.resolve(runId)
    return provider.getStatus(repoRoot)
  }

  async diff(request: AgentSourceControlDiffRequest) {
    const { provider, repoRoot } = await this.resolve(request.runId)
    return provider.getDiff(repoRoot, request.filePath, request.area === 'staged')
  }

  async review(request: AgentSourceControlReviewRequest) {
    const { provider, repoRoot } = await this.resolve(request.runId)
    return provider.getBranchCompare(repoRoot, request.baseRef)
  }

  async reviewDiff(request: AgentSourceControlReviewDiffRequest) {
    const { provider, repoRoot } = await this.resolve(request.runId)
    const results = await provider.getBranchDiff(repoRoot, request.baseRef, {
      includePatch: true,
      filePath: request.filePath,
      ...(request.oldPath ? { oldPath: request.oldPath } : {}),
      ...(request.headOid ? { headOid: request.headOid } : {})
    })
    return (
      results[0] ?? {
        kind: 'text' as const,
        originalContent: '',
        modifiedContent: '',
        originalIsBinary: false as const,
        modifiedIsBinary: false as const
      }
    )
  }

  private async resolve(
    runId: string
  ): Promise<{ provider: ComputerSourceControlGitProvider; repoRoot: string }> {
    const run = this.options.roster.getRun(runId)
    if (!run) {
      throw new Error(`Run not found: ${runId}`)
    }

    let computer = await this.options.computers.inspect(run.computerId)
    if (computer.state !== 'running') {
      computer = await this.options.computers.start(run.computerId)
    }
    if (computer.id !== run.computerId) {
      throw new Error(SOURCE_CONTROL_UNVERIFIABLE)
    }

    const target = await this.options.host.connect(run.computerId)
    const provider = this.getGitProvider(target.id)
    if (!provider) {
      throw new Error(`${SOURCE_CONTROL_UNVERIFIABLE}: managed Git provider is unavailable`)
    }

    const sourceDirectory = run.sourceDirectory ?? COMPUTER_WORKSPACE
    const discovered = await provider.isGitRepoAsync(sourceDirectory)
    if (!discovered.isRepo || !discovered.rootPath) {
      throw new Error('Run source directory is not inside a Git repository')
    }
    const repoRoot = posix.normalize(discovered.rootPath)
    if (
      !posix.isAbsolute(discovered.rootPath) ||
      repoRoot !== discovered.rootPath ||
      (repoRoot !== COMPUTER_WORKSPACE && !repoRoot.startsWith(`${COMPUTER_WORKSPACE}/`))
    ) {
      throw new Error(`${SOURCE_CONTROL_UNVERIFIABLE}: repository root is outside /workspace`)
    }
    return { provider, repoRoot }
  }
}
