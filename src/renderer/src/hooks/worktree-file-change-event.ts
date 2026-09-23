import type { FsChangedPayload } from '../../../shared/filesystem-entry-types'

export const DORKA_WORKTREE_FILE_CHANGE_EVENT = 'dorka:worktree-file-change'

export type WorktreeFileChangeEventDetail = {
  payload: FsChangedPayload
  runtimeEnvironmentId: string | null
}
