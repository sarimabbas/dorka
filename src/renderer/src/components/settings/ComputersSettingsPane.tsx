import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { ComputerRuntimeInfo } from '../../../../shared/computer-runtime'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY,
  COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { ComputerSettingsRow } from './ComputerSettingsRow'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

type ComputersLoadState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'degraded'; message: string }
  | {
      kind: 'ready'
      computers: ComputerRuntimeInfo[]
      supportsConfiguration: boolean
      supportsGitIdentity: boolean
    }

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
  const openSettingsPage = useAppStore((store) => store.openSettingsPage)
  const openSettingsTarget = useAppStore((store) => store.openSettingsTarget)
  const activeTarget = getActiveRuntimeTarget(settings)
  const openServerSettings = (): void => {
    openSettingsTarget({ pane: 'servers', repoId: null, intent: 'add-remote-dorka-server' })
    openSettingsPage()
  }

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
          setState({
            kind: 'ready',
            computers,
            supportsConfiguration: status.capabilities.includes(
              COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY
            ),
            supportsGitIdentity: status.capabilities.includes(
              COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY
            )
          })
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
              ...current,
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
    const local = activeTarget.kind === 'local'
    return (
      <div className="flex min-h-28 flex-col items-start justify-center gap-3 py-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {local
              ? translate(
                  'dorka.computers.connectServerTitle',
                  'Connect a Dorka Server to manage Computers.'
                )
              : translate(
                  'auto.components.settings.ComputersSettingsPane.unsupportedTitle',
                  'Computers are not supported by this runtime.'
                )}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {local
              ? translate(
                  'dorka.computers.connectServerDescription',
                  'Computers run on a Dorka Server. Pair this app with a Server, then select it as active.'
                )
              : translate(
                  'auto.components.settings.ComputersSettingsPane.unsupportedDescription',
                  'Update the selected Dorka server to manage computers here.'
                )}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openServerSettings}>
          {translate('dorka.computers.serverSettings', 'Server settings')}
        </Button>
      </div>
    )
  }

  if (state.kind === 'degraded') {
    const local = activeTarget.kind === 'local'
    return (
      <div className="flex min-h-28 flex-col items-start justify-center gap-3">
        <div className="space-y-1" role="alert">
          <p className="text-sm font-medium">
            {local
              ? translate(
                  'dorka.computers.connectServerTitle',
                  'Connect a Dorka Server to manage Computers.'
                )
              : translate(
                  'dorka.computers.serverUnreachableTitle',
                  'Cannot reach the selected Dorka Server.'
                )}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{state.message}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={openServerSettings}>
            {translate('dorka.computers.serverSettings', 'Server settings')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw />
            {translate('auto.components.settings.ComputersSettingsPane.retry', 'Retry')}
          </Button>
        </div>
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
        state.computers.map((computer) => (
          <ComputerSettingsRow
            key={computer.id}
            computer={computer}
            settings={settings}
            supportsConfiguration={state.supportsConfiguration}
            supportsGitIdentity={state.supportsGitIdentity}
            lifecyclePending={pendingComputerId === computer.id}
            onToggleRunning={() => void setComputerRunning(computer, computer.state !== 'running')}
          />
        ))
      )}
    </div>
  )
}
