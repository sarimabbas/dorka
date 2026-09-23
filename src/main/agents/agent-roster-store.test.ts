import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('persists a terminal launch preset and reloads its Run', async () => {
    const { directory, store } = await openStore()
    const agent = await createAgent(store)
    const run = await store.createRun({
      agentId: agent.id,
      computerId: 'computer-a',
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
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a',
      status: 'succeeded',
      result: 'Done'
    })
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

    const linked = await store.updateRun(run.id, {
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a'
    })

    expect(linked).toMatchObject({
      terminalSessionId: 'terminal-a',
      processIdentity: 'process-a'
    })
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

  it('validates version 1 records loaded from disk without migration', async () => {
    const { directory } = await openStore()
    await writeFile(
      join(directory, AGENT_ROSTER_FILE_NAME),
      JSON.stringify({ version: 1, agents: [{ id: 'incomplete' }], runs: [] })
    )

    await expect(AgentRosterStore.open(directory)).rejects.toThrow()
  })
})
