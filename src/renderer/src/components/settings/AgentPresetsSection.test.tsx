// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/agent-roster'
import {
  createRuntimeAgentPreset,
  listRuntimeAgentPresets
} from '@/runtime/runtime-agent-roster-client'
import type * as RuntimeAgentRosterClient from '@/runtime/runtime-agent-roster-client'
import { AgentPresetsSection } from './AgentPresetsSection'

vi.mock('@/runtime/runtime-agent-roster-client', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeAgentRosterClient>()
  return {
    ...actual,
    createRuntimeAgentPreset: vi.fn(),
    listRuntimeAgentPresets: vi.fn()
  }
})

const listPresets = vi.mocked(listRuntimeAgentPresets)
const createPreset = vi.mocked(createRuntimeAgentPreset)
const preset: Agent = {
  id: 'agent-1',
  name: 'Release reviewer',
  character: { color: 'violet', variant: 'orb' },
  job: 'Review releases',
  harnessId: 'claude',
  promptTemplate: 'Review the release.',
  createdAt: 1,
  updatedAt: 1
}

function renderSection() {
  return render(<AgentPresetsSection target={{ kind: 'local' }} />)
}

afterEach(cleanup)

describe('AgentPresetsSection', () => {
  beforeEach(() => {
    listPresets.mockReset()
    createPreset.mockReset()
  })

  it('lists saved presets from the selected runtime', async () => {
    listPresets.mockResolvedValue([preset])

    renderSection()

    expect(await screen.findByText('Release reviewer')).toBeTruthy()
    expect(screen.getByText('Review releases')).toBeTruthy()
    expect(listPresets).toHaveBeenCalledWith({ kind: 'local' })
  })

  it('shows the empty state after a successful list', async () => {
    listPresets.mockResolvedValue([])

    renderSection()

    expect(await screen.findByText('No agent presets yet.')).toBeTruthy()
  })

  it('shows a retryable list error', async () => {
    listPresets.mockRejectedValueOnce(new Error('Host unavailable')).mockResolvedValueOnce([])

    renderSection()

    expect((await screen.findByRole('alert')).textContent).toContain('Host unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(listPresets).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('No agent presets yet.')).toBeTruthy()
  })

  it('creates a terminal preset with the strict request shape', async () => {
    listPresets.mockResolvedValue([])
    createPreset.mockResolvedValue({ ...preset, name: 'Focused reviewer' })
    renderSection()
    await screen.findByText('No agent presets yet.')

    fireEvent.click(screen.getByRole('button', { name: 'New preset' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Focused reviewer ' } })
    fireEvent.change(screen.getByLabelText('Job'), { target: { value: ' Review releases ' } })
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: ' Inspect changes and report risks. ' }
    })
    const form = screen.getByRole<HTMLButtonElement>('button', { name: 'Create preset' }).form
    expect(form).not.toBeNull()
    if (form) {
      fireEvent.submit(form)
    }

    await waitFor(() => expect(createPreset).toHaveBeenCalledOnce())
    expect(createPreset).toHaveBeenCalledWith(
      { kind: 'local' },
      {
        name: 'Focused reviewer',
        character: { color: 'violet', variant: 'orb' },
        job: 'Review releases',
        harnessId: 'claude',
        promptTemplate: 'Inspect changes and report risks.'
      }
    )
    expect(await screen.findByText('Focused reviewer')).toBeTruthy()
  })
})
