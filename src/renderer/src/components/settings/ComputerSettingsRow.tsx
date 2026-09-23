import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ComputerGitIdentity } from '../../../../shared/computer-git-identity'
import type { ComputerRuntimeInfo } from '../../../../shared/computer-runtime'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { ComputerConfigurationForm } from './ComputerConfigurationForm'

type IdentityState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; identity: ComputerGitIdentity }
  | { kind: 'error'; message: string; identity?: ComputerGitIdentity }

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : translate(
        'auto.components.settings.ComputerSettingsRow.identityFailed',
        'Could not manage this Computer’s Git identity.'
      )
}

export function ComputerSettingsRow({
  computer,
  settings,
  supportsConfiguration,
  supportsGitIdentity,
  lifecyclePending,
  onToggleRunning
}: {
  computer: ComputerRuntimeInfo
  settings: GlobalSettings
  supportsConfiguration: boolean
  supportsGitIdentity: boolean
  lifecyclePending: boolean
  onToggleRunning: () => void
}): React.JSX.Element {
  const isRunning = computer.state === 'running'
  const [identityState, setIdentityState] = useState<IdentityState>({ kind: 'idle' })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [identityLoadAttempt, setIdentityLoadAttempt] = useState(0)

  useEffect(() => {
    if (!supportsGitIdentity || !isRunning) {
      setIdentityState({ kind: 'idle' })
      setName('')
      setEmail('')
      return
    }
    const controller = new AbortController()
    setSaved(false)
    setIdentityState({ kind: 'loading' })
    void callRuntimeRpc<ComputerGitIdentity>(
      getActiveRuntimeTarget(settings),
      'computers.gitIdentity.get',
      { id: computer.id },
      { signal: controller.signal }
    )
      .then((identity) => {
        if (controller.signal.aborted) {
          return
        }
        setName(identity.name ?? '')
        setEmail(identity.email ?? '')
        setIdentityState({ kind: 'ready', identity })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setIdentityState({ kind: 'error', message: errorMessage(error) })
        }
      })
    return () => controller.abort()
  }, [computer.id, identityLoadAttempt, isRunning, settings, supportsGitIdentity])

  const saveIdentity = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const identity = await callRuntimeRpc<ComputerGitIdentity>(
        getActiveRuntimeTarget(settings),
        'computers.gitIdentity.set',
        { id: computer.id, name, email }
      )
      setName(identity.name ?? '')
      setEmail(identity.email ?? '')
      setIdentityState({ kind: 'ready', identity })
      setSaved(true)
    } catch (error) {
      setIdentityState((current) => ({
        kind: 'error',
        message: errorMessage(error),
        identity:
          current.kind === 'ready' || current.kind === 'error' ? current.identity : undefined
      }))
    } finally {
      setSaving(false)
    }
  }

  const identity =
    identityState.kind === 'ready' || identityState.kind === 'error'
      ? (identityState.identity ?? null)
      : null
  const dirty = name !== (identity?.name ?? '') || email !== (identity?.email ?? '')
  const identityDisabled =
    !isRunning ||
    identityState.kind === 'idle' ||
    identityState.kind === 'loading' ||
    (identityState.kind === 'error' && !identityState.identity) ||
    saving
  const nameId = `computer-${computer.id}-git-name`
  const emailId = `computer-${computer.id}-git-email`
  const displayName =
    computer.name === `dorka-computer-${computer.id}`
      ? computer.id
          .split(/[-_\s]+/)
          .filter(Boolean)
          .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
          .join(' ')
      : computer.name

  return (
    <div className="space-y-4 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
            <Badge variant="outline" className="capitalize text-muted-foreground">
              {computer.state}
            </Badge>
          </div>
        </div>
        {isRunning ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={lifecyclePending}>
                {lifecyclePending ? <Loader2 className="animate-spin" /> : null}
                {translate('auto.components.settings.ComputersSettingsPane.stop', 'Stop')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Stop {displayName}?</DialogTitle>
                <DialogDescription>
                  Running processes will end.
                  {dirty ? ' Unsaved Git identity changes will be discarded.' : ''}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button type="button" variant="destructive" onClick={onToggleRunning}>
                    Stop Computer
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={lifecyclePending}
            onClick={onToggleRunning}
          >
            {lifecyclePending ? <Loader2 className="animate-spin" /> : null}
            {translate('auto.components.settings.ComputersSettingsPane.start', 'Start')}
          </Button>
        )}
      </div>

      {supportsConfiguration || supportsGitIdentity ? (
        <details className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
            Setup
          </summary>
          <div className="mt-3 mb-4 space-y-1 font-mono text-[11px] text-muted-foreground">
            <p>Computer: {computer.id}</p>
            <p className="truncate">Image: {computer.image}</p>
          </div>
          {supportsConfiguration ? (
            <div className="border-b border-border/60 pb-4">
              <ComputerConfigurationForm computerId={computer.id} settings={settings} />
            </div>
          ) : null}
          {supportsGitIdentity ? (
            <form className="mt-4 space-y-3" onSubmit={(event) => void saveIdentity(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={nameId}>
                    {translate(
                      'auto.components.settings.ComputerSettingsRow.gitDisplayName',
                      'Git display name'
                    )}
                  </Label>
                  <Input
                    id={nameId}
                    value={name}
                    maxLength={128}
                    autoComplete="name"
                    disabled={identityDisabled}
                    required
                    onChange={(event) => {
                      setName(event.target.value)
                      setSaved(false)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={emailId}>
                    {translate(
                      'auto.components.settings.ComputerSettingsRow.gitEmail',
                      'Git email'
                    )}
                  </Label>
                  <Input
                    id={emailId}
                    type="email"
                    value={email}
                    maxLength={254}
                    autoComplete="email"
                    disabled={identityDisabled}
                    required
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setSaved(false)
                    }}
                  />
                </div>
              </div>
              <div className="flex min-h-8 items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {!isRunning
                    ? translate(
                        'auto.components.settings.ComputerSettingsRow.startToEdit',
                        'Start this Computer to edit its Git identity.'
                      )
                    : identityState.kind === 'loading' || identityState.kind === 'idle'
                      ? translate(
                          'auto.components.settings.ComputerSettingsRow.loadingIdentity',
                          'Loading Git identity…'
                        )
                      : identityState.kind === 'error'
                        ? identityState.message
                        : saved
                          ? translate('auto.components.settings.ComputerSettingsRow.saved', 'Saved')
                          : translate(
                              'auto.components.settings.ComputerSettingsRow.identityDescription',
                              'Used for commits made on this Computer.'
                            )}
                </p>
                {identityState.kind === 'error' && !identityState.identity ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIdentityLoadAttempt((attempt) => attempt + 1)}
                  >
                    Retry
                  </Button>
                ) : (
                  <Button type="submit" size="sm" disabled={identityDisabled || !dirty}>
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    {translate(
                      'auto.components.settings.ComputerSettingsRow.save',
                      'Save Git identity'
                    )}
                  </Button>
                )}
              </div>
            </form>
          ) : null}
        </details>
      ) : null}
    </div>
  )
}
