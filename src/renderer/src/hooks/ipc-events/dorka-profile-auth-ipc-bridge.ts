import { useAppStore } from '../../store'

/** Re-reads auth status when main clears a revoked cloud session behind the renderer's back. */
export function registerDorkaProfileAuthIpcBridge(unsubs: (() => void)[]): void {
  const subscribe = window.api.dorkaProfiles?.onAuthStatusChanged
  if (typeof subscribe !== 'function') {
    return
  }
  unsubs.push(
    subscribe(() => {
      void useAppStore.getState().fetchDorkaProfileAuthStatus()
    })
  )
}
