export const DORKA_EDITOR_SAVE_DIRTY_FILES_EVENT = 'dorka:editor-save-dirty-files'
export const DORKA_EDITOR_PREPARE_HOT_EXIT_EVENT = 'dorka:editor-prepare-hot-exit'

export type EditorSaveDirtyFilesDetail = {
  claim: () => void
  resolve: () => void
  reject: (message: string) => void
}

export type EditorPrepareHotExitDetail = EditorSaveDirtyFilesDetail
