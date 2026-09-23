import {
  DORKA_APP_RESTART_ABORTED_EVENT,
  DORKA_APP_RESTART_STARTED_EVENT,
  DORKA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT,
  DORKA_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT
} from '../../../shared/updater-renderer-events'
import { DORKA_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT } from '../../../shared/renderer-shutdown-events'

let intentionalAppRestartInProgress = false

export function isUpdaterQuitAndInstallInProgress(): boolean {
  return isIntentionalAppRestartInProgress()
}

export function isIntentionalAppRestartInProgress(): boolean {
  return intentionalAppRestartInProgress
}

export function registerUpdaterBeforeUnloadBypass(): () => void {
  const markInProgress = (): void => {
    intentionalAppRestartInProgress = true
  }
  const clearInProgress = (): void => {
    intentionalAppRestartInProgress = false
  }

  window.addEventListener(DORKA_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT, markInProgress)
  window.addEventListener(DORKA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT, clearInProgress)
  window.addEventListener(DORKA_APP_RESTART_STARTED_EVENT, markInProgress)
  window.addEventListener(DORKA_APP_RESTART_ABORTED_EVENT, clearInProgress)
  window.addEventListener(DORKA_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT, clearInProgress)

  return () => {
    window.removeEventListener(DORKA_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT, markInProgress)
    window.removeEventListener(DORKA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT, clearInProgress)
    window.removeEventListener(DORKA_APP_RESTART_STARTED_EVENT, markInProgress)
    window.removeEventListener(DORKA_APP_RESTART_ABORTED_EVENT, clearInProgress)
    window.removeEventListener(DORKA_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT, clearInProgress)
    // Why: hot reloads can re-register this listener inside the same renderer.
    // Reset the module flag on cleanup so a failed earlier restart attempt
    // cannot silently suppress future unsaved-change prompts.
    intentionalAppRestartInProgress = false
  }
}
