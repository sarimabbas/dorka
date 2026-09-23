// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listRuntimeAgentRuns: vi.fn() }))

vi.mock('@/runtime/runtime-agent-roster-client', () => ({
  AgentRunHistoryUnsupportedError: class extends Error {},
  listRuntimeAgentRuns: mocks.listRuntimeAgentRuns
}))

vi.mock('./RunTerminalOutput', () => ({
  RunTerminalOutput: ({ terminal }: { terminal: string }) => <div>Output for {terminal}</div>
}))

vi.mock('./RunChangesPanel', () => ({
  RunChangesPanel: () => null
}))

import { AgentRunHistory } from './AgentRunHistory'

describe('AgentRunHistory', () => {
  beforeEach(() => {
    mocks.listRuntimeAgentRuns.mockReset()
    mocks.listRuntimeAgentRuns.mockResolvedValue([
      {
        id: 'run-sensitive-id',
        agentId: 'agent-1',
        computerId: 'main',
        prompt: 'Inspect the current workspace',
        status: 'running',
        terminalSessionId: 'term-sensitive-id',
        processIdentity: 'process-sensitive-id',
        createdAt: Date.now()
      }
    ])
  })

  afterEach(cleanup)

  it('leads with task and friendly Computer while hiding diagnostic identities', async () => {
    render(<AgentRunHistory agentId="agent-1" target={{ kind: 'local' }} refreshKey={0} />)

    expect(await screen.findByText('Inspect the current workspace')).toBeInTheDocument()
    expect(screen.getByText(/Main ·/)).toBeInTheDocument()
    const details = screen.getByText('Details').closest('details')
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'View Output' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Changes' })).toBeEnabled()

    fireEvent.click(screen.getByText('Details'))

    expect(details).toHaveAttribute('open')
    expect(screen.getByText('Run: run-sensitive-id')).toBeInTheDocument()
    expect(screen.getByText('Terminal: term-sensitive-id')).toBeInTheDocument()
  })

  it('labels the inline terminal tail as output rather than a live terminal', async () => {
    render(<AgentRunHistory agentId="agent-1" target={{ kind: 'local' }} refreshKey={0} />)

    fireEvent.click(await screen.findByRole('button', { name: 'View Output' }))

    expect(screen.getByText('Output for term-sensitive-id')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Output' })).toBeEnabled()
  })
})
