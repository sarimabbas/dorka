import { BrowserWindow } from 'electron'
import { DORKA_PROFILE_AUTH_STATUS_CHANGED_CHANNEL } from '../../shared/dorka-profiles'

export function broadcastDorkaProfileAuthStatusChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(DORKA_PROFILE_AUTH_STATUS_CHANGED_CHANNEL)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}
