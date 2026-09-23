// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../../../shared/agent-roster'
import {
  createRuntimeAgentPreset,
  listRuntimeAgentComputers,
  listRuntimeAgentPresets,
  listRuntimeAgentRuns,
  runRuntimeAgentPreset
} from '@/runtime/runtime-agent-roster-client'
import type * as RuntimeAgentRosterClient from '@/runtime/runtime-agent-roster-client'
import { AgentPresetsSection } from './AgentPresetsSection'

vi.mock('@/runtime/runtime-agent-roster-client', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeAgentRosterClient>()
  return {
    ...actual,
    createRuntimeAgentPreset: vi.fn(),
    listRuntimeAgentComputers: vi.fn(),
    listRuntimeAgentPresets: vi.fn(),
    listRuntimeAgentRuns: vi.fn(),
    runRuntimeAgentPreset: vi.fn()
  }
})

const listPresets = vi.mocked(listRuntimeAgentPresets)
const listComputers = vi.mocked(listRuntimeAgentComputers)
const listRuns = vi.mocked(listRuntimeAgentRuns)
const createPreset = vi.mocked(createRuntimeAgentPreset)
const runPreset = vi.mocked(runRuntimeAgentPreset)
const preset: Agent = {
  id: 'agent-1',
  name: 'Release reviewer',
  character: { color: 'violet', variant: 'orb' },
  job: 'Review releases',
  harnessId: 'claude',
  promptTemplate: 'Review the release.',
  revision: 1,
  references: { version: 1, items: [] },
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
    listComputers.mockReset()
    listRuns.mockReset()
    listRuns.mockResolvedValue([])
    createPreset.mockReset()
    runPreset.mockReset()
  })

  it('lists saved presets from the selected runtime', async () => {
    listPresets.mockResolvedValue([preset])

    renderSection()

    expect(await screen.findByText('Release reviewer')).toBeTruthy()
    expect(screen.getByText('Review releases')).toBeTruthy()
    expect(listPresets).toHaveBeenCalledWith({ kind: 'local' })
  })

  it('keeps Run requests stable when the selected runtime object is recreated', async () => {
    listPresets.mockResolvedValue([preset])

    const view = render(
      <AgentPresetsSection target={{ kind: 'environment', environmentId: 'server-1' }} />
    )
    await screen.findByText('No Runs yet.')
    view.rerender(
      <AgentPresetsSection target={{ kind: 'environment', environmentId: 'server-1' }} />
    )

    await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(1))
    expect(listRuns).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'server-1' },
      { agentId: preset.id }
    )
  })

  it('shows persisted Runs under their Agent with Computer and terminal identity', async () => {
    listPresets.mockResolvedValue([preset])
    listRuns.mockResolvedValue([
      {
        id: 'run-persisted',
        agentId: preset.id,
        computerId: 'runner-1',
        status: 'succeeded',
        prompt: 'Review the release.',
        terminalSessionId: 'term-persisted',
        processIdentity: 'pty-persisted',
        createdAt: 10,
        finishedAt: 20
      }
    ])

    renderSection()

    expect(await screen.findByText(/Runner 1 ·/)).toBeTruthy()
    fireEvent.click(screen.getByText('Details'))
    expect(screen.getByText('Computer: runner-1')).toBeTruthy()
    expect(screen.getByText('Terminal: term-persisted')).toBeTruthy()
    expect(screen.getByText('Process: pty-persisted')).toBeTruthy()
    expect(listRuns).toHaveBeenCalledWith({ kind: 'local' }, { agentId: preset.id })
  })

  it('launches inline on a selectable Computer and reports the returned identity', async () => {
    const user = userEvent.setup()
    listPresets.mockResolvedValue([preset])
    listComputers.mockResolvedValue([
      { id: 'runner-1', name: 'Runner', image: 'computer:test', state: 'stopped' },
      { id: 'new-1', name: 'New Computer', image: 'computer:test', state: 'created' }
    ])
    runPreset.mockResolvedValue({
      id: 'run-1',
      agentId: preset.id,
      computerId: 'runner-1',
      status: 'running',
      prompt: 'Review the release.\n\nCheck the release.',
      terminalSessionId: 'term-1',
      processIdentity: 'pty-1:inc-1',
      createdAt: 1,
      startedAt: 2
    })

    renderSection()
    await user.click(await screen.findByRole('button', { name: 'Launch' }))
    await user.click(await screen.findByRole('combobox', { name: 'Computer' }))
    expect(screen.queryByRole('option', { name: 'New Computer · created' })).toBeNull()
    await user.click(screen.getByRole('option', { name: 'Runner · stopped' }))
    await user.type(screen.getByLabelText('Task prompt'), ' Check the release. ')
    await user.click(screen.getByRole('button', { name: 'Launch agent' }))

    await waitFor(() => expect(runPreset).toHaveBeenCalledOnce())
    expect(runPreset).toHaveBeenCalledWith(
      { kind: 'local' },
      { agentId: preset.id, computerId: 'runner-1', prompt: 'Check the release.' }
    )
    expect(await screen.findByText('Run status: running')).toBeTruthy()
    expect(screen.getByText('Terminal: term-1')).toBeTruthy()
    expect(screen.getByText('Process: pty-1:inc-1')).toBeTruthy()
  })

  it('shows the empty state after a successful list', async () => {
    listPresets.mockResolvedValue([])

    renderSection()

    expect(await screen.findByText('No agents yet.')).toBeTruthy()
  })

  it('shows a retryable list error', async () => {
    listPresets.mockRejectedValueOnce(new Error('Host unavailable')).mockResolvedValueOnce([])

    renderSection()

    expect((await screen.findByRole('alert')).textContent).toContain('Host unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(listPresets).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('No agents yet.')).toBeTruthy()
  })

  it('creates a terminal preset with the strict request shape', async () => {
    listPresets.mockResolvedValue([])
    createPreset.mockResolvedValue({ ...preset, name: 'Focused reviewer' })
    renderSection()
    await screen.findByText('No agents yet.')

    fireEvent.click(screen.getByRole('button', { name: 'New agent' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Focused reviewer ' } })
    fireEvent.change(screen.getByLabelText('Job'), { target: { value: ' Review releases ' } })
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: ' Inspect changes and report risks. ' }
    })
    const form = screen.getByRole<HTMLButtonElement>('button', { name: 'Create agent' }).form
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
