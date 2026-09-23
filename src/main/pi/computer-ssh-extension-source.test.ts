import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPiComputerSshExtensionSource } from './computer-ssh-extension-source'

type Tool = { name: string; operations: Record<string, (...args: unknown[]) => unknown> }
type Child = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { end: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
}

const spawned: { command: string; args: string[]; child: Child }[] = []

function makeChild(): Child {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { end: vi.fn() },
    kill: vi.fn()
  })
}

function loadExtension(): {
  tools: Map<string, Tool>
  userBash: () => { operations: Tool['operations'] }
} {
  const source = getPiComputerSshExtensionSource()
  const output = transformSync(source, { format: 'cjs', target: 'node20' }).code
  const tools = new Map<string, Tool>()
  let userBash: (() => { operations: Tool['operations'] }) | undefined
  const makeTool =
    (name: string) => (_cwd: string, options: { operations: Tool['operations'] }) => ({
      name,
      operations: options.operations
    })
  const requireModule = (specifier: string): unknown => {
    if (specifier === 'node:child_process') {
      return {
        spawn(command: string, args: string[]): Child {
          const child = makeChild()
          spawned.push({ command, args, child })
          return child
        }
      }
    }
    if (specifier === '@earendil-works/pi-coding-agent') {
      return {
        createBashTool: makeTool('bash'),
        createEditTool: makeTool('edit'),
        createReadTool: makeTool('read'),
        createWriteTool: makeTool('write')
      }
    }
    return require(specifier)
  }
  const extensionModule: { exports: { default?: (pi: unknown) => void } } = { exports: {} }
  const evaluate = new Function('require', 'module', 'exports', output)
  evaluate(requireModule, extensionModule, extensionModule.exports)
  extensionModule.exports.default?.({
    registerTool(tool: Tool) {
      tools.set(tool.name, tool)
    },
    on(event: string, handler: () => { operations: Tool['operations'] }) {
      if (event === 'user_bash') {
        userBash = handler
      }
    }
  })
  if (!userBash) {
    throw new Error('user_bash handler was not registered')
  }
  return { tools, userBash }
}

function validEnvironment(): void {
  vi.stubEnv('DORKA_COMPUTER_SSH_HOST', 'computer.example')
  vi.stubEnv('DORKA_COMPUTER_SSH_PORT', '2222')
  vi.stubEnv('DORKA_COMPUTER_SSH_USER', 'agent')
  vi.stubEnv('DORKA_COMPUTER_SSH_IDENTITY_FILE', '/control/private/id_ed25519')
  vi.stubEnv('DORKA_COMPUTER_SSH_KNOWN_HOSTS_FILE', '/control/private/known_hosts')
  vi.stubEnv('DORKA_COMPUTER_EXECUTION_GENERATION', 'generation-7')
  vi.stubEnv('DORKA_COMPUTER_SOURCE_DIRECTORY', '/workspace/repo')
}

function operation(tool: Tool | undefined, name: string): (...args: unknown[]) => unknown {
  const value = tool?.operations[name]
  if (!value) {
    throw new Error(`Missing ${name} operation`)
  }
  return value
}

describe('getPiComputerSshExtensionSource', () => {
  beforeEach(() => {
    spawned.length = 0
    validEnvironment()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('overrides all filesystem and shell tools plus user_bash without model-selected SSH config', () => {
    const { tools, userBash } = loadExtension()

    expect([...tools.keys()]).toEqual(['read', 'write', 'edit', 'bash'])
    expect(userBash().operations).toBeDefined()
    expect(getPiComputerSshExtensionSource()).not.toContain('registerFlag')
  })

  it('maps scratch paths under the fixed Computer source and generation-checks before access', async () => {
    const { tools } = loadExtension()
    const file = resolve(process.cwd(), 'src/example file.ts')
    const result = Promise.resolve(operation(tools.get('read'), 'readFile')(file))
    const call = spawned[0]

    expect(call.command).toBe('/usr/bin/ssh')
    expect(call.args.slice(0, -1)).toEqual([
      '-o',
      'BatchMode=yes',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ConnectionAttempts=1',
      '-o',
      'ServerAliveInterval=5',
      '-o',
      'ServerAliveCountMax=3',
      '-o',
      'UserKnownHostsFile=/control/private/known_hosts',
      '-i',
      '/control/private/id_ed25519',
      '-p',
      '2222',
      '--',
      'agent@computer.example'
    ])
    expect(call.args.at(-1)).toContain(
      'dorka_generation=$(cat $HOME/.dorka/execution-generation); [ "$dorka_generation" = \'generation-7\' ]'
    )
    expect(call.args.at(-1)).toContain(
      "cd -- '/workspace/repo'; cat -- '/workspace/repo/src/example file.ts'"
    )
    call.child.stdout.emit('data', Buffer.from('contents'))
    call.child.emit('close', 0)
    await expect(result).resolves.toEqual(Buffer.from('contents'))
  })

  it('rejects paths outside the scratch root before spawning SSH', () => {
    const { tools } = loadExtension()
    const outside = resolve(process.cwd(), '..', 'escape.txt')

    expect(() => operation(tools.get('read'), 'readFile')(outside)).toThrow(
      'Path is outside the Dorka Computer workspace'
    )
    expect(spawned).toHaveLength(0)
  })

  it('fails closed when fixed environment configuration is absent', () => {
    vi.stubEnv('DORKA_COMPUTER_SSH_HOST', '')
    const { tools, userBash } = loadExtension()

    expect(() =>
      operation(tools.get('read'), 'readFile')(resolve(process.cwd(), 'README.md'))
    ).toThrow('Dorka Computer SSH is unavailable: missing DORKA_COMPUTER_SSH_HOST')
    expect(userBash().operations).toBeDefined()
    expect(spawned).toHaveLength(0)
  })

  it('streams output, redacts credential paths, and aborts user shell execution', async () => {
    const { userBash } = loadExtension()
    const abort = new AbortController()
    const chunks: string[] = []
    const result = operation({ name: 'user_bash', operations: userBash().operations }, 'exec')(
      'printf hello',
      process.cwd(),
      {
        onData: (chunk: Buffer) => chunks.push(chunk.toString()),
        signal: abort.signal,
        timeout: 30
      }
    )
    const child = spawned[0].child

    child.stdout.emit('data', Buffer.from('hello'))
    child.stderr.emit('data', Buffer.from('bad key /control/private/id_'))
    child.stderr.emit('data', Buffer.from('ed25519'))
    abort.abort()
    expect(child.kill).toHaveBeenCalledOnce()
    child.emit('close', null)

    await expect(result).rejects.toThrow('outcome is unverifiable after cancellation')
    expect(chunks.join('')).toBe('hellobad key [private key]')
  })

  it('kills timed-out shell execution and reports the Pi timeout contract', async () => {
    vi.useFakeTimers()
    const { tools } = loadExtension()
    const result = operation(tools.get('bash'), 'exec')('sleep 10', process.cwd(), {
      onData: vi.fn(),
      signal: undefined,
      timeout: 2
    })
    const child = spawned[0].child

    await vi.advanceTimersByTimeAsync(2000)
    expect(child.kill).toHaveBeenCalledOnce()
    child.emit('close', null)
    await expect(result).rejects.toThrow('outcome is unverifiable after timeout:2')
  })
})
