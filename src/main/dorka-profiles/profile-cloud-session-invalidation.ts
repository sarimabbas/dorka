type DorkaCloudSessionInvalidationListener = () => void

const listeners = new Set<DorkaCloudSessionInvalidationListener>()

/**
 * Fires when an auth failure (revoked or rotated-away refresh token) clears a
 * stored cloud session. Never fires for an explicit user sign-out, which already
 * hands the fresh auth status back to its caller.
 */
export function onDorkaCloudSessionInvalidated(
  listener: DorkaCloudSessionInvalidationListener
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitDorkaCloudSessionInvalidated(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.warn(
        '[dorka-profiles] Cloud session invalidation listener failed:',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
