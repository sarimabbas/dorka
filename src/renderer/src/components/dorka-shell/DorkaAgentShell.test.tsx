// @vitest-environment happy-dom

import { act } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DorkaAgentShell } from './DorkaAgentShell'

describe('DorkaAgentShell', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    cleanup()
  })

  it('filters the agent roster and switches conversations', async () => {
    const user = userEvent.setup()
    render(<DorkaAgentShell />)

    await user.type(screen.getByLabelText('Search agents'), 'Lin')
    const roster = screen.getByRole('navigation', { name: 'Agents' })
    expect(within(roster).queryByRole('button', { name: /Mara/ })).toBeNull()

    await user.click(within(roster).getByRole('button', { name: /Lin/ }))
    expect(screen.getByLabelText('Message Lin')).not.toBeNull()
  })

  it('supports job, capability, and message interactions', async () => {
    const user = userEvent.setup()
    render(<DorkaAgentShell />)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('progressbar', { name: 'Release readiness progress' })).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('button', { name: 'Approved' }).hasAttribute('disabled')).toBe(true)

    const composer = screen.getByLabelText('Message Mara')
    await user.type(composer, 'Proceed with the notes{enter}')
    expect(screen.getByText('Proceed with the notes')).not.toBeNull()
    if (!(composer instanceof HTMLTextAreaElement)) {
      throw new Error('Composer is not a textarea')
    }
    expect(composer.value).toBe('')
  })

  it('opens the transient inspector and focuses search with the platform shortcut', async () => {
    const user = userEvent.setup()
    render(<DorkaAgentShell />)

    await user.click(screen.getByRole('button', { name: /Computer/ }))
    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(screen.getByText(/Local workspace/)).not.toBeNull()

    await user.keyboard('{Escape}')
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    })
    expect(document.activeElement).toBe(screen.getByLabelText('Search agents'))
  })

  it('creates a typed local agent without backend state', async () => {
    const user = userEvent.setup()
    render(<DorkaAgentShell />)

    await user.click(screen.getAllByRole('button', { name: 'Create agent' })[0])
    expect(screen.getByLabelText('Message Agent 5')).not.toBeNull()
    expect(screen.getByText('New teammate')).not.toBeNull()
  })
})
