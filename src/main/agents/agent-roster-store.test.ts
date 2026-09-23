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

async function createAgentWithConversation(store: AgentRosterStore) {
  const agent = await store.createAgent({
    name: 'Builder',
    character: { color: 'blue', variant: 'orb' },
    job: 'Build the requested change',
    instructions: 'Prefer small changes',
    boundaries: ['Do not deploy'],
    tools: ['shell']
  })
  const conversation = await store.createConversation({ agentId: agent.id, title: 'Primary' })
  return { agent, conversation }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('AgentRosterStore', () => {
  it('reloads durable Agent, Conversation, and Run records', async () => {
    const { directory, store } = await openStore()
    const { agent, conversation } = await createAgentWithConversation(store)
    const run = await store.createRun({
      agentId: agent.id,
      conversationId: conversation.id,
      computerId: 'computer-a',
      prompt: 'Implement it'
    })
    await store.transitionRun(run.id, { status: 'running' })
    await store.transitionRun(run.id, { status: 'succeeded', result: 'Done' })

    const reloaded = await AgentRosterStore.open(directory)

    expect(reloaded.getAgent(agent.id)).toMatchObject({ name: 'Builder', memoryPolicy: 'agent' })
    expect(reloaded.getConversation(conversation.id)).toEqual(conversation)
    expect(reloaded.getRun(run.id)).toMatchObject({
      computerId: 'computer-a',
      status: 'succeeded',
      result: 'Done'
    })
  })

  it('uses an Agent move only for future Runs and copies no Computer state', async () => {
    const { store } = await openStore()
    const { agent, conversation } = await createAgentWithConversation(store)
    const first = await store.createRun({
      agentId: agent.id,
      conversationId: conversation.id,
      computerId: 'computer-a',
      prompt: 'First'
    })

    const moved = await store.moveAgent(agent.id, 'computer-b')
    const second = await store.createRun({
      agentId: agent.id,
      conversationId: conversation.id,
      prompt: 'Second'
    })

    expect(moved).not.toHaveProperty('computerId')
    expect(moved.lastComputerId).toBe('computer-b')
    expect(store.getRun(first.id)?.computerId).toBe('computer-a')
    expect(second.computerId).toBe('computer-b')
  })

  it('rejects invalid Run transitions without changing the persisted Run', async () => {
    const { directory, store } = await openStore()
    const { agent, conversation } = await createAgentWithConversation(store)
    const run = await store.createRun({
      agentId: agent.id,
      conversationId: conversation.id,
      computerId: 'computer-a',
      prompt: 'Try it'
    })

    await expect(store.transitionRun(run.id, { status: 'succeeded' })).rejects.toThrow(
      'Invalid Run transition: queued -> succeeded'
    )

    expect((await AgentRosterStore.open(directory)).getRun(run.id)?.status).toBe('queued')
  })

  it('validates records loaded from disk', async () => {
    const { directory } = await openStore()
    await writeFile(
      join(directory, AGENT_ROSTER_FILE_NAME),
      JSON.stringify({ version: 1, agents: [{ id: 'incomplete' }], conversations: [], runs: [] })
    )

    await expect(AgentRosterStore.open(directory)).rejects.toThrow()
  })
})
