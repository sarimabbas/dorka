import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComputerRuntimeInfo } from '../../shared/computer-runtime'
import {
  AgentExecutionService,
  AgentTerminalLaunchOutcomeUnknownError
} from './agent-execution-service'
import { AgentRosterStore } from './agent-roster-store'

const computerExecutionGeneration = '10000000-0000-4000-8000-000000000001'
const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function fixture(state: ComputerRuntimeInfo['state'] = 'running') {
  const directory = await mkdtemp(join(tmpdir(), 'dorka-agent-execution-'))
  directories.push(directory)
  const roster = await AgentRosterStore.open(directory)
  const agent = await roster.createAgent({
    name: 'Planner',
    character: { color: 'blue', variant: 'owl' },
    job: 'Plan work',
    harnessId: 'codex',
    promptTemplate: 'Plan carefully',
    workingDirectory: '/workspace/repo'
  })
  const computer: ComputerRuntimeInfo = {
    id: 'computer-a',
    name: 'dorka-computer-computer-a',
    image: 'dorka-computer:test',
    state
  }
  const inspect = vi.fn(async () => computer)
  const getExecutionGeneration = vi.fn(async () => computerExecutionGeneration)
  const start = vi.fn(async () => ({ ...computer, state: 'running' as const }))
  const launch = vi.fn(async () => ({
    terminalSessionId: 'terminal-session-1',
    processIdentity: 'pty-incarnation-1',
    ptyId: 'pty-1'
  }))
  const service = new AgentExecutionService(
    roster,
    { getExecutionGeneration, inspect, start },
    launch
  )
  return {
    agent,
    computer,
    directory,
    getExecutionGeneration,
    inspect,
    launch,
    roster,
    service,
    start
  }
}

describe('AgentExecutionService', () => {
  it('launches and durably records one deterministic effective prompt with placement and identity', async () => {
    const h = await fixture('stopped')

    const run = await h.service.run({
      agentId: h.agent.id,
      computerId: h.computer.id,
      prompt: 'Review the change'
    })

    expect(h.start).toHaveBeenCalledWith('computer-a')
    expect(h.launch).toHaveBeenCalledWith({
      runId: run.id,
      agent: h.agent,
      computer: { ...h.computer, state: 'running' },
      computerExecutionGeneration,
      prompt: 'Plan carefully\n\nReview the change',
      sourceDirectory: '/workspace/repo'
    })
    expect(run).toMatchObject({
      agentId: h.agent.id,
      agentRevision: h.agent.revision,
      computerId: 'computer-a',
      computerExecutionGeneration,
      prompt: 'Plan carefully\n\nReview the change',
      sourceDirectory: '/workspace/repo',
      status: 'running',
      terminalSessionId: 'terminal-session-1',
      processIdentity: 'pty-incarnation-1'
    })
    expect((await AgentRosterStore.open(h.directory)).getRun(run.id)).toMatchObject({
      agentRevision: h.agent.revision,
      computerId: 'computer-a',
      computerExecutionGeneration,
      prompt: 'Plan carefully\n\nReview the change',
      sourceDirectory: '/workspace/repo',
      terminalSessionId: 'terminal-session-1',
      processIdentity: 'pty-incarnation-1'
    })
  })

  it('registers an immediate PTY exit only after terminal identity persistence', async () => {
    const h = await fixture()
    h.launch.mockResolvedValueOnce({
      terminalSessionId: 'terminal-session-1',
      processIdentity: 'pty-1:incarnation-1',
      ptyId: 'pty-1'
    })
    const observe = vi.fn((runId: string, ptyId: string) => {
      expect(ptyId).toBe('pty-1')
      expect(h.roster.getRun(runId)).toMatchObject({
        terminalSessionId: 'terminal-session-1',
        processIdentity: 'pty-1:incarnation-1'
      })
      void h.roster.transitionRunningRunToWaiting(runId)
    })
    const service = new AgentExecutionService(
      h.roster,
      {
        getExecutionGeneration: h.getExecutionGeneration,
        inspect: h.inspect,
        start: h.start
      },
      h.launch,
      observe
    )

    const run = await service.run({
      agentId: h.agent.id,
      computerId: h.computer.id,
      prompt: 'Review the change'
    })

    expect(observe).toHaveBeenCalledWith(run.id, 'pty-1')
    await vi.waitFor(() => expect(h.roster.getRun(run.id)?.status).toBe('waiting'))
  })

  it('snapshots the generation before creating the Run', async () => {
    const h = await fixture()
    const generation = Promise.withResolvers<string>()
    h.getExecutionGeneration.mockReturnValueOnce(generation.promise)
    const createRun = vi.spyOn(h.roster, 'createRun')

    const pending = h.service.run({
      agentId: h.agent.id,
      computerId: h.computer.id,
      prompt: 'Review the change'
    })
    await vi.waitFor(() => expect(h.getExecutionGeneration).toHaveBeenCalledWith('computer-a'))
    expect(createRun).not.toHaveBeenCalled()

    generation.resolve(computerExecutionGeneration)
    await expect(pending).resolves.toMatchObject({ computerExecutionGeneration })
  })

  it('records a failed Run when terminal delegation fails', async () => {
    const h = await fixture()
    h.launch.mockRejectedValueOnce(new Error('SSH terminal unavailable'))

    await expect(
      h.service.run({
        agentId: h.agent.id,
        computerId: h.computer.id,
        prompt: 'Review the change'
      })
    ).rejects.toThrow('SSH terminal unavailable')

    expect(h.roster.listRuns()).toHaveLength(1)
    expect(h.roster.listRuns()[0]).toMatchObject({
      computerId: 'computer-a',
      status: 'failed',
      error: 'SSH terminal unavailable'
    })
    expect(h.roster.listRuns()[0]?.finishedAt).toEqual(expect.any(Number))
  })

  it('leaves a committed but unverifiable launch waiting instead of claiming failure', async () => {
    const h = await fixture()
    h.launch.mockRejectedValueOnce(new AgentTerminalLaunchOutcomeUnknownError())

    await expect(
      h.service.run({
        agentId: h.agent.id,
        computerId: h.computer.id,
        prompt: 'Review the change'
      })
    ).resolves.toMatchObject({ status: 'waiting' })

    expect(h.roster.listRuns()[0]).toMatchObject({
      status: 'waiting',
      prompt: 'Plan carefully\n\nReview the change'
    })
    expect(h.roster.listRuns()[0]).not.toHaveProperty('error')
    expect(h.roster.listRuns()[0]?.finishedAt).toBeUndefined()
  })

  it('does not create a Run when the Agent or Computer cannot be resolved', async () => {
    const h = await fixture()
    await expect(
      h.service.run({ agentId: 'missing', computerId: h.computer.id, prompt: 'work' })
    ).rejects.toThrow('Agent not found')
    h.inspect.mockRejectedValueOnce(new Error('Computer not found: missing'))
    await expect(
      h.service.run({ agentId: h.agent.id, computerId: 'missing', prompt: 'work' })
    ).rejects.toThrow('Computer not found')

    expect(h.roster.listRuns()).toEqual([])
    expect(h.launch).not.toHaveBeenCalled()
  })
})
