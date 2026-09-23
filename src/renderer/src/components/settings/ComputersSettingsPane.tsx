import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { ComputerRuntimeInfo } from '../../../../shared/computer-runtime'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type ComputersLoadState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'degraded'; message: string }
  | { kind: 'ready'; computers: ComputerRuntimeInfo[] }

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : translate(
        'auto.components.settings.ComputersSettingsPane.loadFailed',
        'Could not reach the selected Dorka runtime.'
      )
}

export function ComputersSettingsPane({
  settings
}: {
  settings: GlobalSettings
}): React.JSX.Element {
  const [state, setState] = useState<ComputersLoadState>({ kind: 'loading' })
  const [pendingComputerId, setPendingComputerId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setState({ kind: 'loading' })
      setActionError(null)
      const target = getActiveRuntimeTarget(settings)
      try {
        const status = await callRuntimeRpc<RuntimeStatus>(target, 'status.get', undefined, {
          signal
        })
        if (signal?.aborted) {
          return
        }
        if (!status.capabilities?.includes(COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY)) {
          setState({ kind: 'unsupported' })
          return
        }
        const computers = await callRuntimeRpc<ComputerRuntimeInfo[]>(
          target,
          'computers.list',
          {},
          {
            signal
          }
        )
        if (!signal?.aborted) {
          setState({ kind: 'ready', computers })
        }
      } catch (error) {
        if (!signal?.aborted) {
          setState({ kind: 'degraded', message: errorMessage(error) })
        }
      }
    },
    [settings]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const setComputerRunning = async (
    computer: ComputerRuntimeInfo,
    shouldRun: boolean
  ): Promise<void> => {
    setPendingComputerId(computer.id)
    setActionError(null)
    try {
      const updated = await callRuntimeRpc<ComputerRuntimeInfo>(
        getActiveRuntimeTarget(settings),
        shouldRun ? 'computers.start' : 'computers.stop',
        { id: computer.id }
      )
      setState((current) =>
        current.kind === 'ready'
          ? {
              kind: 'ready',
              computers: current.computers.map((entry) =>
                entry.id === updated.id ? updated : entry
              )
            }
          : current
      )
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setPendingComputerId(null)
    }
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {translate('auto.components.settings.ComputersSettingsPane.loading', 'Loading computers…')}
      </div>
    )
  }

  if (state.kind === 'unsupported') {
    return (
      <div className="space-y-1 py-4">
        <p className="text-sm font-medium">
          {translate(
            'auto.components.settings.ComputersSettingsPane.unsupportedTitle',
            'Computers are not supported by this runtime.'
          )}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {translate(
            'auto.components.settings.ComputersSettingsPane.unsupportedDescription',
            'Update the selected Dorka server to manage computers here.'
          )}
        </p>
      </div>
    )
  }

  if (state.kind === 'degraded') {
    return (
      <div className="flex min-h-28 flex-col items-start justify-center gap-3">
        <div className="space-y-1" role="alert">
          <p className="text-sm font-medium">
            {translate(
              'auto.components.settings.ComputersSettingsPane.degradedTitle',
              'Computers are temporarily unavailable.'
            )}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{state.message}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw />
          {translate('auto.components.settings.ComputersSettingsPane.retry', 'Retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {actionError ? (
        <p className="pb-4 text-xs text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      {state.computers.length === 0 ? (
        <div className="space-y-1 py-4">
          <p className="text-sm font-medium">
            {translate(
              'auto.components.settings.ComputersSettingsPane.emptyTitle',
              'No computers yet.'
            )}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {translate(
              'auto.components.settings.ComputersSettingsPane.emptyDescription',
              'Computers created on the selected Dorka runtime will appear here.'
            )}
          </p>
        </div>
      ) : (
        state.computers.map((computer) => {
          const isRunning = computer.state === 'running'
          const isPending = pendingComputerId === computer.id
          return (
            <div key={computer.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{computer.name}</p>
                  <Badge variant="outline" className="capitalize text-muted-foreground">
                    {computer.state}
                  </Badge>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">{computer.id}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => void setComputerRunning(computer, !isRunning)}
              >
                {isPending ? <Loader2 className="animate-spin" /> : null}
                {isRunning
                  ? translate('auto.components.settings.ComputersSettingsPane.stop', 'Stop')
                  : translate('auto.components.settings.ComputersSettingsPane.start', 'Start')}
              </Button>
            </div>
          )
        })
      )}
    </div>
  )
}
