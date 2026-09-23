// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ callRuntimeRpc: vi.fn() }))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc
}))

import { RunTerminalOutput } from './RunTerminalOutput'

describe('RunTerminalOutput', () => {
  beforeEach(() => mocks.callRuntimeRpc.mockReset())
  afterEach(cleanup)

  it('reads and refreshes the selected Run terminal', async () => {
    const user = userEvent.setup()
    mocks.callRuntimeRpc
      .mockResolvedValueOnce({ terminal: { tail: ['Agent ready', 'Working'] } })
      .mockResolvedValueOnce({ terminal: { tail: ['Agent ready', 'Done'] } })

    render(<RunTerminalOutput terminal="term-1" target={{ kind: 'local' }} />)

    await waitFor(() =>
      expect(screen.getByLabelText('Terminal output').querySelector('pre')).toHaveTextContent(
        'Agent ready Working'
      )
    )
    expect(mocks.callRuntimeRpc).toHaveBeenNthCalledWith(1, { kind: 'local' }, 'terminal.read', {
      terminal: 'term-1',
      limit: 200
    })

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Terminal output').querySelector('pre')).toHaveTextContent(
        'Agent ready Done'
      )
    )
  })

  it('surfaces an exact terminal read failure', async () => {
    mocks.callRuntimeRpc.mockRejectedValueOnce(new Error('Terminal disconnected'))

    render(<RunTerminalOutput terminal="term-1" target={{ kind: 'local' }} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Terminal disconnected')
  })
})
