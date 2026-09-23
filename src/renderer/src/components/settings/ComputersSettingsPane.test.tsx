// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { RuntimeClientTarget } from '@/runtime/runtime-client-target'
import {
  COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  getActiveRuntimeTarget: vi.fn<() => RuntimeClientTarget>(() => ({ kind: 'local' })),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc,
  getActiveRuntimeTarget: mocks.getActiveRuntimeTarget
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      openSettingsPage: mocks.openSettingsPage,
      openSettingsTarget: mocks.openSettingsTarget
    })
}))

import { ComputersSettingsPane } from './ComputersSettingsPane'

const settings = getDefaultSettings('/tmp')
const stoppedComputer = {
  id: 'dev-box',
  name: 'Development box',
  image: 'dorka/computer@sha256:one',
  state: 'stopped' as const
}
const runningComputer = { ...stoppedComputer, state: 'running' as const }
const createdComputer = {
  ...stoppedComputer,
  id: 'new-box',
  name: 'New box',
  state: 'created' as const
}

function supportedStatus(): { capabilities: string[] } {
  return { capabilities: [COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY] }
}

function identitySupportedStatus(): { capabilities: string[] } {
  return {
    capabilities: [COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY, COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY]
  }
}

describe('ComputersSettingsPane', () => {
  beforeEach(() => {
    mocks.callRuntimeRpc.mockReset()
    mocks.getActiveRuntimeTarget.mockReset()
    mocks.getActiveRuntimeTarget.mockReturnValue({ kind: 'local' })
    mocks.openSettingsPage.mockReset()
    mocks.openSettingsTarget.mockReset()
  })

  afterEach(cleanup)

  it('shows loading while the runtime capability probe is pending', () => {
    mocks.callRuntimeRpc.mockReturnValue(new Promise(() => {}))

    render(<ComputersSettingsPane settings={settings} />)

    expect(screen.getByText('Loading computers…')).toBeInTheDocument()
  })

  it('lists live computer state from the active runtime', async () => {
    mocks.getActiveRuntimeTarget.mockReturnValue({
      kind: 'environment',
      environmentId: 'server-1'
    })
    mocks.callRuntimeRpc
      .mockResolvedValueOnce(supportedStatus())
      .mockResolvedValueOnce([
        { ...runningComputer, id: 'live-box', name: 'Live box' },
        stoppedComputer,
        createdComputer
      ])

    render(<ComputersSettingsPane settings={settings} />)

    expect(await screen.findByText('Development box')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('stopped')).toBeInTheDocument()
    expect(screen.getByText('created')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(2)
    expect(mocks.callRuntimeRpc).toHaveBeenNthCalledWith(
      2,
      { kind: 'environment', environmentId: 'server-1' },
      'computers.list',
      {},
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('shows a retryable degraded state when the runtime cannot list computers', async () => {
    mocks.callRuntimeRpc
      .mockResolvedValueOnce(supportedStatus())
      .mockRejectedValueOnce(new Error('Runtime is offline'))

    render(<ComputersSettingsPane settings={settings} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connect a Dorka Server to manage Computers.'
    )
    expect(screen.getByText('Runtime is offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Server settings' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('capability-gates runtimes without computer lifecycle support', async () => {
    mocks.callRuntimeRpc.mockResolvedValueOnce({ capabilities: [] })

    render(<ComputersSettingsPane settings={settings} />)

    expect(
      await screen.findByText('Connect a Dorka Server to manage Computers.')
    ).toBeInTheDocument()
    expect(mocks.callRuntimeRpc).toHaveBeenCalledOnce()
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalledWith(
      expect.anything(),
      'computers.list',
      expect.anything(),
      expect.anything()
    )
  })

  it('edits and saves a running Computer Git identity inline', async () => {
    const user = userEvent.setup()
    mocks.callRuntimeRpc
      .mockResolvedValueOnce(identitySupportedStatus())
      .mockResolvedValueOnce([runningComputer])
      .mockResolvedValueOnce({ name: 'Ada Lovelace', email: 'ada@example.com' })
      .mockResolvedValueOnce({ name: 'Grace Hopper', email: 'grace@example.com' })

    render(<ComputersSettingsPane settings={settings} />)

    const name = await screen.findByLabelText('Git display name')
    const email = screen.getByLabelText('Git email')
    await waitFor(() => expect(name).toHaveValue('Ada Lovelace'))
    expect(email).toHaveValue('ada@example.com')

    await user.clear(name)
    await user.type(name, 'Grace Hopper')
    await user.clear(email)
    await user.type(email, 'grace@example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocks.callRuntimeRpc).toHaveBeenNthCalledWith(
      4,
      { kind: 'local' },
      'computers.gitIdentity.set',
      { id: 'dev-box', name: 'Grace Hopper', email: 'grace@example.com' }
    )
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('does not read identity or silently start a stopped Computer', async () => {
    mocks.callRuntimeRpc
      .mockResolvedValueOnce(identitySupportedStatus())
      .mockResolvedValueOnce([stoppedComputer])

    render(<ComputersSettingsPane settings={settings} />)

    expect(
      await screen.findByText('Start this Computer to edit its Git identity.')
    ).toBeInTheDocument()
    expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Git display name')).toBeDisabled()
  })

  it('starts a stopped computer and stops the updated running computer', async () => {
    const user = userEvent.setup()
    mocks.callRuntimeRpc
      .mockResolvedValueOnce(supportedStatus())
      .mockResolvedValueOnce([stoppedComputer])
      .mockResolvedValueOnce(runningComputer)
      .mockResolvedValueOnce(stoppedComputer)

    render(<ComputersSettingsPane settings={settings} />)

    await user.click(await screen.findByRole('button', { name: 'Start' }))
    expect(mocks.callRuntimeRpc).toHaveBeenNthCalledWith(3, { kind: 'local' }, 'computers.start', {
      id: 'dev-box'
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(mocks.callRuntimeRpc).toHaveBeenNthCalledWith(4, { kind: 'local' }, 'computers.stop', {
      id: 'dev-box'
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled())
  })
})
