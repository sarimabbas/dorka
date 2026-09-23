import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentExecutionService } from '../../../agents/agent-execution-service'
import { AgentRosterStore } from '../../../agents/agent-roster-store'
import {
  ComputerRuntimeManager,
  type ComputerCommandExecutor
} from '../../../computers/computer-runtime-manager'
import { DorkaRuntimeService } from '../../dorka-runtime'
import {
  AGENT_EXECUTION_RUNTIME_CAPABILITY,
  AGENT_REFERENCES_RUNTIME_CAPABILITY,
  AGENT_ROSTER_RUNTIME_CAPABILITY,
  AGENT_RUN_HISTORY_RUNTIME_CAPABILITY,
  COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY,
  COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY,
  COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY,
  RUNTIME_CAPABILITIES
} from '../../../../shared/protocol-version'
import { RpcDispatcher } from '../dispatcher'
import { ALL_RPC_METHODS } from '.'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('Agent and Computer lifecycle RPC', () => {
  it('registers strict schemas and advertises additive capabilities', () => {
    const methods = new Map(ALL_RPC_METHODS.map((method) => [method.name, method]))
    const expected = [
      'agents.list',
      'agents.create',
      'agents.move',
      'agents.references.update',
      'agents.run',
      'agents.runs.list',
      'computers.list',
      'computers.create',
      'computers.start',
      'computers.stop',
      'computers.remove',
      'computers.configuration.get',
      'computers.configuration.plan',
      'computers.configuration.replace',
      'computers.gitIdentity.get',
      'computers.gitIdentity.set'
    ] as const

    expect(expected.every((name) => methods.has(name))).toBe(true)
    expect(methods.get('agents.list')?.params?.safeParse({ extra: true }).success).toBe(false)
    expect(methods.get('agents.runs.list')?.params?.safeParse({}).success).toBe(true)
    expect(
      methods.get('agents.runs.list')?.params?.safeParse({ agentId: 'agent-1', path: '/tmp' })
        .success
    ).toBe(false)
    expect(
      methods.get('agents.run')?.params?.safeParse({
        agentId: 'agent-1',
        computerId: 'worker-1',
        prompt: 'work',
        extra: true
      }).success
    ).toBe(false)
    expect(
      methods.get('computers.create')?.params?.safeParse({ id: 'UPPER', image: 'ubuntu:24.04' })
        .success
    ).toBe(false)
    expect(RUNTIME_CAPABILITIES).toContain(AGENT_ROSTER_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(AGENT_REFERENCES_RUNTIME_CAPABILITY)
    expect(
      methods.get('agents.references.update')?.params?.safeParse({
        agentId: 'agent-1',
        expectedRevision: 1,
        references: { version: 1, items: [] },
        path: '/tmp'
      }).success
    ).toBe(false)
    expect(RUNTIME_CAPABILITIES).toContain(AGENT_RUN_HISTORY_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(AGENT_EXECUTION_RUNTIME_CAPABILITY)
    expect(
      methods.get('computers.gitIdentity.set')?.params?.safeParse({
        id: 'worker-1',
        name: 'Ada\nInjected',
        email: 'ada@example.com'
      }).success
    ).toBe(false)
    expect(
      methods.get('computers.gitIdentity.set')?.params?.safeParse({
        id: 'worker-1',
        name: '-c credential.helper=evil',
        email: 'ada@example.com'
      }).success
    ).toBe(false)
    expect(
      methods.get('computers.gitIdentity.set')?.params?.safeParse({
        id: 'worker-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        target: 'ssh-1'
      }).success
    ).toBe(false)
    expect(
      methods.get('computers.configuration.replace')?.params?.safeParse({
        id: 'worker-1',
        expectedRevision: '10000000-0000-4000-8000-000000000001',
        configuration: {
          resources: { cpus: 2, memoryMb: 4096, pids: 512 },
          environment: { preserve: [], set: {} },
          premounts: []
        },
        engineArgs: ['--privileged']
      }).success
    ).toBe(false)
    expect(RUNTIME_CAPABILITIES).toContain(COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY)
  })

  it('does not advertise lifecycle services that the host did not compose', () => {
    const capabilities = new DorkaRuntimeService().getStatus().capabilities

    expect(capabilities).not.toContain(AGENT_ROSTER_RUNTIME_CAPABILITY)
    expect(capabilities).not.toContain(AGENT_REFERENCES_RUNTIME_CAPABILITY)
    expect(capabilities).not.toContain(AGENT_RUN_HISTORY_RUNTIME_CAPABILITY)
    expect(capabilities).not.toContain(AGENT_EXECUTION_RUNTIME_CAPABILITY)
    expect(capabilities).not.toContain(COMPUTER_LIFECYCLE_RUNTIME_CAPABILITY)
    expect(capabilities).not.toContain(COMPUTER_CONFIGURATION_RUNTIME_CAPABILITY)
    expect(capabilities).not.toContain(COMPUTER_GIT_IDENTITY_RUNTIME_CAPABILITY)
  })

  it('routes lifecycle calls and refuses to move an Agent to a missing Computer', async () => {
    const directory = await temporaryDirectory()
    const engine = new FakeComputerEngine()
    const agentRosterStore = await AgentRosterStore.open(directory)
    const computerRuntimeManager = new ComputerRuntimeManager({
      dataDirectory: directory,
      serverId: 'server-1',
      execute: engine.execute
    })
    const agentExecutionService = new AgentExecutionService(
      agentRosterStore,
      computerRuntimeManager,
      async () => ({
        terminalSessionId: 'session-1',
        processIdentity: 'process-1'
      })
    )
    const runtime = new DorkaRuntimeService(null, undefined, {
      agentRosterStore,
      agentExecutionService,
      computerRuntimeManager
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: ALL_RPC_METHODS })
    expect(runtime.getStatus().capabilities).not.toContain(AGENT_REFERENCES_RUNTIME_CAPABILITY)
    const resolvingService = new AgentExecutionService(
      agentRosterStore,
      computerRuntimeManager,
      async () => ({ terminalSessionId: 'session-2', processIdentity: 'process-2' }),
      undefined,
      async () => undefined
    )
    expect(
      new DorkaRuntimeService(null, undefined, {
        agentRosterStore,
        agentExecutionService: resolvingService,
        computerRuntimeManager
      }).getStatus().capabilities
    ).toContain(AGENT_REFERENCES_RUNTIME_CAPABILITY)

    const createdAgent = await dispatch(dispatcher, 'agents.create', {
      name: 'Planner',
      character: { color: 'blue', variant: 'owl' },
      job: 'Plan work',
      harnessId: 'codex',
      promptTemplate: 'Do the work'
    })
    expect(createdAgent.ok).toBe(true)

    const agentId = resultId(createdAgent)
    expect(
      await dispatch(dispatcher, 'agents.references.update', {
        agentId,
        expectedRevision: 1,
        references: {
          version: 1,
          items: [{ kind: 'skill', name: 'code-review', scope: 'either' }]
        }
      })
    ).toMatchObject({ ok: true, result: { outcome: 'updated', agent: { revision: 2 } } })
    expect(
      await dispatch(dispatcher, 'agents.references.update', {
        agentId,
        expectedRevision: 1,
        references: { version: 1, items: [] }
      })
    ).toMatchObject({ ok: true, result: { outcome: 'conflict', currentRevision: 2 } })
    expect(
      await dispatch(dispatcher, 'agents.references.update', {
        agentId,
        expectedRevision: 2,
        references: { version: 1, items: [] }
      })
    ).toMatchObject({ ok: true, result: { outcome: 'updated', agent: { revision: 3 } } })

    const missingMove = await dispatch(dispatcher, 'agents.move', {
      agentId,
      computerId: 'missing'
    })
    expect(missingMove).toMatchObject({ ok: false })

    expect(
      await dispatch(dispatcher, 'computers.create', {
        id: 'worker-1',
        image: 'ubuntu:24.04'
      })
    ).toMatchObject({ ok: true, result: { id: 'worker-1', state: 'created' } })
    expect(
      await dispatch(dispatcher, 'agents.move', {
        agentId,
        computerId: 'worker-1'
      })
    ).toMatchObject({ ok: true, result: { lastComputerId: 'worker-1' } })
    const configuration = await dispatch(dispatcher, 'computers.configuration.get', {
      id: 'worker-1'
    })
    expect(configuration).toMatchObject({
      ok: true,
      result: {
        id: 'worker-1',
        configuration: { environment: [], premounts: [] }
      }
    })
    const revision = resultRevision(configuration)
    expect(
      await dispatch(dispatcher, 'computers.configuration.plan', {
        id: 'worker-1',
        expectedRevision: revision,
        expectedDesiredState: 'stopped',
        configuration: {
          resources: { cpus: 4, memoryMb: 8192, pids: 512 },
          environment: { preserve: [], set: { MODE: 'private-value' } },
          premounts: []
        }
      })
    ).toMatchObject({
      ok: true,
      result: { outcome: 'planned', plan: { replacementRequired: true } }
    })
    expect(await dispatch(dispatcher, 'computers.start', { id: 'worker-1' })).toMatchObject({
      ok: true
    })
    expect(
      await dispatch(dispatcher, 'computers.configuration.replace', {
        id: 'worker-1',
        expectedRevision: revision,
        expectedDesiredState: 'stopped',
        configuration: {
          resources: { cpus: 4, memoryMb: 8192, pids: 512 },
          environment: { preserve: [], set: { MODE: 'private-value' } },
          premounts: []
        }
      })
    ).toMatchObject({ ok: true, result: { outcome: 'conflict' } })
    expect(await dispatch(dispatcher, 'computers.stop', { id: 'worker-1' })).toMatchObject({
      ok: true
    })
    const replaced = await dispatch(dispatcher, 'computers.configuration.replace', {
      id: 'worker-1',
      expectedRevision: revision,
      expectedDesiredState: 'stopped',
      configuration: {
        resources: { cpus: 4, memoryMb: 8192, pids: 512 },
        environment: { preserve: [], set: { MODE: 'private-value' } },
        premounts: []
      }
    })
    expect(replaced).toMatchObject({
      ok: true,
      result: { outcome: 'replaced', snapshot: { configuration: { environment: ['MODE'] } } }
    })
    expect(JSON.stringify(replaced)).not.toContain('private-value')
    expect(await dispatch(dispatcher, 'computers.start', { id: 'worker-1' })).toMatchObject({
      ok: true,
      result: { state: 'running' }
    })
    expect(
      await dispatch(dispatcher, 'agents.run', {
        agentId: resultId(createdAgent),
        computerId: 'worker-1',
        prompt: 'Review the change'
      })
    ).toMatchObject({
      ok: true,
      result: {
        computerId: 'worker-1',
        status: 'running',
        terminalSessionId: 'session-1',
        processIdentity: 'process-1'
      }
    })
    expect(
      await dispatch(dispatcher, 'agents.runs.list', { agentId: resultId(createdAgent) })
    ).toMatchObject({
      ok: true,
      result: [
        {
          agentId: resultId(createdAgent),
          computerId: 'worker-1',
          terminalSessionId: 'session-1'
        }
      ]
    })
    expect(await dispatch(dispatcher, 'computers.stop', { id: 'worker-1' })).toMatchObject({
      ok: true,
      result: { state: 'stopped' }
    })
    expect(await dispatch(dispatcher, 'computers.remove', { id: 'worker-1' })).toMatchObject({
      ok: true
    })

    await Promise.all([
      dispatch(dispatcher, 'computers.create', { id: 'worker-2', image: 'ubuntu:24.04' }),
      dispatch(dispatcher, 'computers.create', { id: 'worker-3', image: 'ubuntu:24.04' })
    ])
    expect(engine.maxConcurrentCreates).toBe(1)
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dorka-lifecycle-rpc-'))
  directories.push(directory)
  return directory
}

async function dispatch(
  dispatcher: RpcDispatcher,
  method: string,
  params: Record<string, unknown>
) {
  return dispatcher.dispatch({
    id: method,
    authToken: 'authenticated-by-transport',
    method,
    params
  })
}

function resultRevision(response: Awaited<ReturnType<typeof dispatch>>): string {
  if (!response.ok || !response.result || typeof response.result !== 'object') {
    throw new Error('Expected a successful object response')
  }
  const revision = Reflect.get(response.result, 'revision')
  if (typeof revision !== 'string') {
    throw new Error('Expected a revision')
  }
  return revision
}

function resultId(response: Awaited<ReturnType<typeof dispatch>>): string {
  if (!response.ok || !response.result || typeof response.result !== 'object') {
    throw new Error('Expected a successful object response')
  }
  const id = Reflect.get(response.result, 'id')
  if (typeof id !== 'string') {
    throw new Error('Expected an id')
  }
  return id
}

class FakeComputerEngine {
  private readonly states = new Map<string, 'created' | 'running' | 'stopped'>()
  private readonly executionGenerations = new Map<string, string>()
  private activeCreates = 0
  maxConcurrentCreates = 0

  readonly execute: ComputerCommandExecutor = async ({ args: processArgs }) => {
    const args = processArgs ?? []
    const command = args[0]
    if (command === 'create') {
      this.activeCreates += 1
      this.maxConcurrentCreates = Math.max(this.maxConcurrentCreates, this.activeCreates)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const id = stripName(args[args.indexOf('--name') + 1] ?? '')
      this.states.set(id, 'created')
      this.executionGenerations.set(
        id,
        (args[args.indexOf('dev.dorka.computer=' + id) + 2] ?? '').replace(
          'dev.dorka.execution-generation=',
          ''
        )
      )
      this.activeCreates -= 1
      return result('')
    }
    if (command === 'start' || command === 'stop') {
      this.states.set(stripName(args[1] ?? ''), command === 'start' ? 'running' : 'stopped')
      return result('')
    }
    if (command === 'rm') {
      const id = stripName(args.at(-1) ?? '')
      this.states.delete(id)
      this.executionGenerations.delete(id)
      return result('')
    }
    if (command === 'ps') {
      return result([...this.states.keys()].map((id) => `engine-${id}`).join('\n'))
    }
    if (command === 'inspect') {
      return result(JSON.stringify(args.slice(1).map((reference) => this.inspection(reference))))
    }
    return result('', 1, `unsupported command: ${command ?? ''}`)
  }

  private inspection(reference: string) {
    const id = reference.startsWith('engine-')
      ? reference.slice('engine-'.length)
      : stripName(reference)
    const state = this.states.get(id)
    if (!state) {
      throw new Error(`missing fake Computer: ${id}`)
    }
    return {
      Id: `engine-${id}`,
      Name: `/dorka-computer-${id}`,
      Config: {
        Image: 'ubuntu:24.04',
        Labels: {
          'dev.dorka.managed': 'true',
          'dev.dorka.server': 'server-1',
          'dev.dorka.computer': id,
          'dev.dorka.execution-generation': this.executionGenerations.get(id) ?? ''
        }
      },
      State: { Running: state === 'running', Status: state }
    }
  }
}

function stripName(name: string): string {
  return name.replace(/^dorka-computer-/, '')
}

function result(stdout: string, code = 0, stderr = '') {
  return { stdout, stderr, code, signal: null, timedOut: false }
}
