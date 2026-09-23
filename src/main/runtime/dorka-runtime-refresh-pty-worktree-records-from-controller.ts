// @ts-nocheck -- mechanically split from DorkaRuntimeService; behavior is covered by AST equivalence and characterization tests.
import { DorkaRuntimeWithRecordPtyWorktree } from './dorka-runtime-record-pty-worktree'
import type { ResolvedWorktree } from './runtime-worktree-path-identity'

export class DorkaRuntimeWithRefreshPtyWorktreeRecordsFromController extends DorkaRuntimeWithRecordPtyWorktree {
  /** Synchronizes PTY tracking records with running daemon sessions, querying their foreground agent states. */
  protected async refreshPtyWorktreeRecordsFromController(
    resolvedWorktrees: ResolvedWorktree[],
    targetWorktreeId: string | null = null,
    deadline?: number
  ): Promise<Set<string> | null> {
    const inventory = await this.refreshPtyWorktreeRecordsWithControllerInventory(
      resolvedWorktrees,
      targetWorktreeId,
      deadline
    )
    return inventory ? new Set(inventory.livePtyIds) : null
  }
}
