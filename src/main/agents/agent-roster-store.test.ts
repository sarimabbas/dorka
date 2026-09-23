import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_ROSTER_FILE_NAME, AgentRosterStore } from './agent-roster-store'

const directories: string[] = []

async function openStore(): Promise<{ directory: string; store: AgentRosterStore }> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-agent-roster-'))
  directories.push(directory)
  return { directory, store: await AgentRosterStore.open(directory) }
}

async function createAgent(store: AgentRosterStore) {
  return store.createAgent({
    name: 'Builder',
    character: { color: 'blue', variant: 'orb' },
    job: 'Build the requested change',
    harnessId: 'codex',
    model: 'gpt-5',
    promptTemplate: 'Prefer small changes. Do not deploy.',
    workingDirectory: '/workspace/project'
  })
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('AgentRosterStore', () => {
  it('leaves legacy Run execution generations undefined after reload', async () => {
    const { directory, store } = await openStore()
    const agent = await createAgent(store)
    const run = await store.createRun({
      agentId: agent.id,
      computerId: 'computer-a',
      prompt: 'Legacy work'
    })

    const reloaded = await AgentRosterStore.open(directory)

    expect(reloaded.getRun(run.id)?.computerExecutionGeneration).toBeUndefined()
  })

  it('persists a terminal launch preset and reloads its Run', async () => {
    const { directory, store } = await openStore()
    const agent = await createAgent(store)
    const run = await store.createRun({
      agentId: agent.id,
      computerId: 'computer-a',
      computerExecutionGeneration: '10000000-0000-4000-8000-000000000001',
      prompt: 'Implement it',
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a'
    })
    await store.transitionRun(run.id, { status: 'running' })
    await store.transitionRun(run.id, { status: 'succeeded', result: 'Done' })

    const reloaded = await AgentRosterStore.open(directory)

    expect(reloaded.getAgent(agent.id)).toMatchObject({
      name: 'Builder',
      harnessId: 'codex',
      model: 'gpt-5',
      promptTemplate: 'Prefer small changes. Do not deploy.',
      workingDirectory: '/workspace/project'
    })
    expect(reloaded.getRun(run.id)).toMatchObject({
      agentId: agent.id,
      computerId: 'computer-a',
      computerExecutionGeneration: '10000000-0000-4000-8000-000000000001',
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a',
      status: 'succeeded',
      result: 'Done'
    })
  })

  it('filters persisted Runs by Agent after reload', async () => {
    const { directory, store } = await openStore()
    const firstAgent = await createAgent(store)
    const secondAgent = await store.createAgent({
      name: 'Reviewer',
      character: { color: 'green', variant: 'orb' },
      job: 'Review the change',
      harnessId: 'claude',
      promptTemplate: 'Review carefully.'
    })
    const firstRun = await store.createRun({
      agentId: firstAgent.id,
      computerId: 'computer-a',
      prompt: 'First'
    })
    await store.createRun({
      agentId: secondAgent.id,
      computerId: 'computer-b',
      prompt: 'Second'
    })

    const reloaded = await AgentRosterStore.open(directory)

    expect(reloaded.listRuns({ agentId: firstAgent.id })).toEqual([firstRun])
    expect(reloaded.listRuns()).toHaveLength(2)
  })

  it('keeps placement on each Run when an Agent preference changes', async () => {
    const { store } = await openStore()
    const agent = await createAgent(store)
    const first = await store.createRun({
      agentId: agent.id,
      computerId: 'computer-a',
      prompt: 'First'
    })

    const moved = await store.moveAgent(agent.id, 'computer-b')
    const second = await store.createRun({
      agentId: agent.id,
      computerId: 'computer-b',
      prompt: 'Second'
    })

    expect(moved).not.toHaveProperty('computerId')
    expect(moved.lastComputerId).toBe('computer-b')
    expect(store.getRun(first.id)?.computerId).toBe('computer-a')
    expect(second.computerId).toBe('computer-b')
  })

  it('links a Run to an existing terminal session', async () => {
    const { store } = await openStore()
    const agent = await createAgent(store)
    const run = await store.createRun({
      agentId: agent.id,
      computerId: 'computer-a',
      prompt: 'Try it'
    })

    const linked = await store.updateRun(
      run.id,
      Object.assign(
        {
          terminalSessionId: 'terminal-a',
          processIdentity: 'process-a'
        },
        { prompt: 'Replace the immutable prompt' }
      )
    )

    expect(linked).toMatchObject({
      prompt: 'Try it',
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a'
    })
  })

  it('preserves concurrent mutations from separate store instances', async () => {
    const { directory, store: first } = await openStore()
    const second = await AgentRosterStore.open(directory)

    const [builder, reviewer] = await Promise.all([
      createAgent(first),
      second.createAgent({
        name: 'Reviewer',
        character: { color: 'green', variant: 'orb' },
        job: 'Review the requested change',
        harnessId: 'claude',
        promptTemplate: 'Review carefully.'
      })
    ])
    await Promise.all([
      first.createRun({ agentId: reviewer.id, computerId: 'computer-a', prompt: 'Review' }),
      second.createRun({ agentId: builder.id, computerId: 'computer-b', prompt: 'Build' })
    ])

    const reloaded = await AgentRosterStore.open(directory)
    expect(reloaded.listAgents().map((agent) => agent.id)).toEqual(
      expect.arrayContaining([builder.id, reviewer.id])
    )
    expect(reloaded.listRuns()).toHaveLength(2)
  })

  it('rejects invalid Run transitions without changing the persisted Run', async () => {
    const { directory, store } = await openStore()
    const agent = await createAgent(store)
    const run = await store.createRun({
      agentId: agent.id,
      computerId: 'computer-a',
      prompt: 'Try it'
    })

    await expect(store.transitionRun(run.id, { status: 'succeeded' })).rejects.toThrow(
      'Invalid Run transition: queued -> succeeded'
    )

    expect((await AgentRosterStore.open(directory)).getRun(run.id)?.status).toBe('queued')
  })

  it('rejects a post-rename directory sync failure without committing in-memory success', async () => {
    let failSync = false
    const syncDirectory = vi.fn(async () => {
      if (failSync) {
        throw new Error('directory fsync failed')
      }
    })
    const directory = await mkdtemp(join(tmpdir(), 'orca-agent-roster-'))
    directories.push(directory)
    const store = await AgentRosterStore.open(directory, { syncDirectory })
    const agent = await createAgent(store)
    const identity = {
      computerId: 'computer-a',
      computerExecutionGeneration: '10000000-0000-4000-8000-000000000001',
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a'
    }
    const run = await store.createRun({
      agentId: agent.id,
      prompt: 'Persist exactly',
      ...identity
    })
    await store.transitionRun(run.id, { status: 'running' })
    failSync = true

    await expect(store.transitionRunningRunToWaitingIfIdentity(run.id, identity)).rejects.toThrow(
      'directory fsync failed'
    )
    expect(store.getRun(run.id)?.status).toBe('running')
  })

  it('changes a running Run only when its complete persisted identity matches', async () => {
    const { store } = await openStore()
    const agent = await createAgent(store)
    const identity = {
      computerId: 'computer-a',
      computerExecutionGeneration: '10000000-0000-4000-8000-000000000001',
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a'
    }
    const run = await store.createRun({ agentId: agent.id, prompt: 'Exact', ...identity })
    await store.transitionRun(run.id, { status: 'running' })

    await store.transitionRunningRunToWaitingIfIdentity(run.id, {
      ...identity,
      processIdentity: 'replacement-process'
    })
    expect(store.getRun(run.id)?.status).toBe('running')
    await store.transitionRunningRunToWaitingIfIdentity(run.id, identity)
    expect(store.getRun(run.id)?.status).toBe('waiting')
  })

  it('validates version 1 records loaded from disk without migration', async () => {
    const { directory } = await openStore()
    await writeFile(
      join(directory, AGENT_ROSTER_FILE_NAME),
      JSON.stringify({ version: 1, agents: [{ id: 'incomplete' }], runs: [] })
    )

    await expect(AgentRosterStore.open(directory)).rejects.toThrow()
  })
})
