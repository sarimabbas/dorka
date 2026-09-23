// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tabsByWorktree: Record<string, { id: string; ptyId: string | null }[]> = {}
  const terminalLayoutsByTabId: Record<
    string,
    { activeLeafId: string | null; ptyIdsByLeafId: Record<string, string> }
  > = {}
  return {
    listRuntimeAgentRuns: vi.fn(),
    activateAndRevealWorkspace: vi.fn(() => ({ primaryTabId: null })),
    activateTabAndFocusPane: vi.fn(),
    closeSettingsPage: vi.fn(),
    tabsByWorktree,
    terminalLayoutsByTabId
  }
})

vi.mock('@/store', () => {
  const useAppStore = <T,>(selector: (state: typeof mocks) => T): T => selector(mocks)
  useAppStore.getState = (): typeof mocks => mocks
  return { useAppStore }
})

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: mocks.activateAndRevealWorkspace
}))

vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))

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
    mocks.activateAndRevealWorkspace.mockClear()
    mocks.activateTabAndFocusPane.mockClear()
    mocks.closeSettingsPage.mockClear()
    mocks.tabsByWorktree = {}
    mocks.terminalLayoutsByTabId = {}
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
    expect(screen.getByRole('button', { name: 'View output' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Changes' })).toBeEnabled()

    fireEvent.click(screen.getByText('Details'))

    expect(details).toHaveAttribute('open')
    expect(screen.getByText('Run: run-sensitive-id')).toBeInTheDocument()
    expect(screen.getByText('Terminal: term-sensitive-id')).toBeInTheDocument()
  })

  it('labels the inline terminal tail as output rather than a live terminal', async () => {
    render(<AgentRunHistory agentId="agent-1" target={{ kind: 'local' }} refreshKey={0} />)

    fireEvent.click(await screen.findByRole('button', { name: 'View output' }))

    expect(screen.getByText('Output for term-sensitive-id')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide output' })).toBeEnabled()
  })

  it('opens an existing Run terminal with incumbent workspace activation', async () => {
    mocks.tabsByWorktree = {
      'workspace-1': [{ id: 'tab-1', ptyId: 'remote:server-1@@term-sensitive-id' }]
    }
    mocks.terminalLayoutsByTabId = {
      'tab-1': {
        activeLeafId: 'leaf-1',
        ptyIdsByLeafId: { 'leaf-1': 'remote:server-1@@term-sensitive-id' }
      }
    }
    mocks.listRuntimeAgentRuns.mockResolvedValueOnce([
      {
        id: 'run-1',
        agentId: 'agent-1',
        computerId: 'main',
        prompt: 'Inspect the current workspace',
        status: 'running',
        terminalSessionId: 'term-sensitive-id',
        processIdentity: 'pty-sensitive-id:incarnation-1',
        createdAt: Date.now()
      }
    ])
    render(
      <AgentRunHistory
        agentId="agent-1"
        target={{ kind: 'environment', environmentId: 'server-1' }}
        refreshKey={0}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Open terminal' }))

    expect(mocks.activateAndRevealWorkspace).toHaveBeenCalledWith('workspace-1', {
      executionHostId: 'runtime:server-1'
    })
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith('tab-1', 'leaf-1', {
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    expect(mocks.closeSettingsPage).toHaveBeenCalledOnce()
  })

  it('does not offer a terminal owned by another or unverifiable runtime', async () => {
    mocks.tabsByWorktree = {
      'workspace-1': [
        { id: 'tab-wrong-host', ptyId: 'remote:server-2@@term-sensitive-id' },
        { id: 'tab-ownerless', ptyId: 'remote:term-sensitive-id' }
      ]
    }
    render(
      <AgentRunHistory
        agentId="agent-1"
        target={{ kind: 'environment', environmentId: 'server-1' }}
        refreshKey={0}
      />
    )

    expect(await screen.findByText('Inspect the current workspace')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open terminal' })).not.toBeInTheDocument()
  })

  it('keeps Settings open and explains when the terminal disappears before activation', async () => {
    mocks.tabsByWorktree = {
      'workspace-1': [{ id: 'tab-1', ptyId: 'remote:server-1@@term-sensitive-id' }]
    }
    render(
      <AgentRunHistory
        agentId="agent-1"
        target={{ kind: 'environment', environmentId: 'server-1' }}
        refreshKey={0}
      />
    )
    const button = await screen.findByRole('button', { name: 'Open terminal' })
    mocks.tabsByWorktree = {}

    fireEvent.click(button)

    expect(screen.getByRole('status')).toHaveTextContent(
      'That terminal is no longer open. View its saved output instead.'
    )
    expect(mocks.activateAndRevealWorkspace).not.toHaveBeenCalled()
    expect(mocks.closeSettingsPage).not.toHaveBeenCalled()
  })
})
