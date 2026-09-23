import type {
  TransferDorkaProfileProjectArgs,
  TransferDorkaProfileProjectResult
} from '../../shared/dorka-profiles'
import { getDorkaProfileListState } from './profile-index-store'
import { readProfileState, writeProfileState } from './profile-project-state-file'
import { removeSourceRepo } from './profile-project-source-removal'
import {
  applyPayloadToTarget,
  createTargetRepo,
  createTransferPayload
} from './profile-project-transfer-payload'
import { repoPhysicalKey } from './profile-project-worktree-identity'

function assertKnownProfiles(args: TransferDorkaProfileProjectArgs, userDataPath: string): void {
  const profiles = getDorkaProfileListState(userDataPath).profiles
  const ids = new Set(profiles.map((profile) => profile.id))
  if (!ids.has(args.sourceProfileId)) {
    throw new Error('unknown_source_dorka_profile')
  }
  if (!ids.has(args.targetProfileId)) {
    throw new Error('unknown_target_dorka_profile')
  }
  if (args.sourceProfileId === args.targetProfileId) {
    throw new Error('matching_dorka_profile_transfer')
  }
}

export function transferDorkaProfileProject(
  args: TransferDorkaProfileProjectArgs,
  userDataPath: string
): TransferDorkaProfileProjectResult {
  assertKnownProfiles(args, userDataPath)
  const sourceState = readProfileState(args.sourceProfileId, userDataPath)
  const targetState = readProfileState(args.targetProfileId, userDataPath)
  const sourceRepo = sourceState.repos.find((repo) => repo.id === args.repoId)
  if (!sourceRepo) {
    throw new Error('unknown_source_repo')
  }
  const duplicate = targetState.repos.find(
    (repo) => repoPhysicalKey(repo) === repoPhysicalKey(sourceRepo)
  )
  if (duplicate) {
    return {
      status: 'duplicate-target',
      sourceProfileId: args.sourceProfileId,
      targetProfileId: args.targetProfileId,
      sourceRepoId: sourceRepo.id,
      duplicateRepoId: duplicate.id
    }
  }

  const targetRepo = createTargetRepo(sourceRepo, targetState, args.mode === 'copy')
  const payload = createTransferPayload({
    sourceState,
    sourceRepo,
    targetRepo,
    includeSessions: args.mode === 'move'
  })
  writeProfileState(args.targetProfileId, userDataPath, applyPayloadToTarget(targetState, payload))
  if (args.mode === 'move') {
    writeProfileState(
      args.sourceProfileId,
      userDataPath,
      removeSourceRepo(sourceState, sourceRepo.id)
    )
  }
  return {
    status: 'transferred',
    mode: args.mode,
    sourceProfileId: args.sourceProfileId,
    targetProfileId: args.targetProfileId,
    sourceRepoId: sourceRepo.id,
    targetRepoId: targetRepo.id,
    targetProjectId: payload.targetProjectId
  }
}
