import type { DorkaRuntimeService } from '../dorka-runtime'

export function routeDispatcherClientHostedBrowserRpc(
  runtime: DorkaRuntimeService,
  method: string,
  params: unknown
) {
  const candidate = runtime as DorkaRuntimeService & {
    routeClientHostedBrowserRpc?: DorkaRuntimeService['routeClientHostedBrowserRpc']
  }
  return candidate.routeClientHostedBrowserRpc?.(method, params) ?? { handled: false as const }
}
