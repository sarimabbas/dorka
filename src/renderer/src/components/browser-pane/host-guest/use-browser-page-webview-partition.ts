import { useAppStore } from '@/store'
import { DORKA_BROWSER_PARTITION } from '../../../../../shared/constants'
import { getDorkaProfileBrowserDefaultPartition } from '../../../../../shared/dorka-profiles'

export function useBrowserPageWebviewPartition({
  sessionProfileId,
  sessionPartition
}: {
  sessionProfileId: string | null
  sessionPartition: string | null
}): string {
  const browserSessionProfiles = useAppStore((s) => s.browserSessionProfiles)
  const activeDorkaProfileId = useAppStore((s) => s.activeDorkaProfileId)
  const fallbackBrowserPartition = activeDorkaProfileId
    ? getDorkaProfileBrowserDefaultPartition(activeDorkaProfileId)
    : null
  const defaultSessionProfile = browserSessionProfiles.find((p) => p.id === 'default') ?? null
  const sessionProfile = sessionProfileId
    ? (browserSessionProfiles.find((p) => p.id === sessionProfileId) ?? null)
    : defaultSessionProfile
  return (
    sessionPartition ??
    sessionProfile?.partition ??
    defaultSessionProfile?.partition ??
    fallbackBrowserPartition ??
    DORKA_BROWSER_PARTITION
  )
}
