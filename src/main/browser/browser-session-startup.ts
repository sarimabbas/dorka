import { browserSessionRegistry } from './browser-session-registry'
import type { BrowserSessionRegistryProfileOptions } from './browser-session-registry'
import { collectOrphanedBrowserRoutePartitionStorage } from './browser-route-partition-storage-runtime'
import { configureRouteSessionsForDorkaProfile } from './browser-route-session-runtime'
import { configurePairedRuntimeBrowserClientHostsForDorkaProfile } from './paired-runtime-browser-client-host-runtime'

let initialized = false

export function initializeBrowserSessionsForApp(
  activeProfile?: BrowserSessionRegistryProfileOptions & {
    listLocalSshTargetIds?: () => string[]
  }
): void {
  if (initialized) {
    return
  }

  if (activeProfile) {
    browserSessionRegistry.configureForDorkaProfile(activeProfile)
    configureRouteSessionsForDorkaProfile({
      dorkaProfileId: activeProfile.dorkaProfileId,
      profileDirectory: activeProfile.profileDirectory
    })
    configurePairedRuntimeBrowserClientHostsForDorkaProfile({
      dorkaProfileId: activeProfile.dorkaProfileId
    })
    void collectOrphanedBrowserRoutePartitionStorage(activeProfile.listLocalSshTargetIds).catch(
      (error) => {
        console.warn('[browser-route-partition] orphan collection failed:', error)
      }
    )
  }

  // Why: cookie replay must happen before the first session.fromPartition()
  // call, otherwise Chromium opens the stale live cookie DB before import.
  browserSessionRegistry.applyPendingCookieImport()
  browserSessionRegistry.initializeBrowserSessionsFromPersistedState()
  initialized = true
}
