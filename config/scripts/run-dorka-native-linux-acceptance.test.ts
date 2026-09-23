import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  acceptanceBuildArgs,
  acceptanceEngineFacts,
  acceptanceNames,
  acquireAcceptanceLock,
  assertUnverifiable,
  certificateMatchesRun,
  cleanupResourceNames,
  redactArtifact,
  releaseAcceptanceLock
} from './run-dorka-native-linux-acceptance'
import { managedPtyExitCertificateId } from '../../src/shared/managed-pty-exit-evidence'
import { assertPreSpawnFailure } from '../../tests/e2e/fixtures/dorka-native-linux-computer/native-linux-agent-requirements-acceptance.mjs'

function fixture() {
  const computerExecutionGeneration = randomUUID()
  const ptyIncarnationId = randomUUID()
  const relayGeneration = randomUUID()
  const relayPtyId = `pty2:${relayGeneration}:7`
  const draft = {
    version: 1 as const,
    computerExecutionGeneration,
    relayGeneration,
    relayPtyId,
    ptyIncarnationId,
    exitCode: 23,
    observedAt: 1,
    evidence: 'node-pty-exit' as const
  }
  return {
    run: {
      id: 'run-1',
      status: 'running',
      terminalSessionId: 'term_10000000-0000-4000-8000-000000000001',
      processIdentity: `ssh:runtime-ssh-computer-main@@${relayPtyId}:${ptyIncarnationId}`,
      computerExecutionGeneration
    },
    certificate: { ...draft, certificateId: managedPtyExitCertificateId(draft) }
  }
}

describe('native Linux acceptance contracts', () => {
  it('uses a signal that an interactive owning shell cannot ignore', () => {
    const shim = readFileSync(
      resolve(
        import.meta.dirname,
        '../../tests/e2e/fixtures/dorka-native-linux-computer/agent-shim.sh'
      ),
      'utf8'
    )

    expect(shim.indexOf('while [[ ! -e "/workspace/$token.exit" ]]')).toBeLessThan(
      shim.indexOf('kill -KILL "$PPID"')
    )
  })

  it('ships and extracts the standalone RPC client used by the native host', () => {
    const build = readFileSync(resolve(import.meta.dirname, 'build-dorkad.mjs'), 'utf8')
    const runtime = readFileSync(
      resolve(
        import.meta.dirname,
        '../../tests/e2e/fixtures/dorka-native-linux-computer/native-linux-acceptance-runtime.mjs'
      ),
      'utf8'
    )

    expect(build).toContain("const RUNTIME_CLIENT_ENTRY = join(ROOT, 'src/cli/runtime/client.ts')")
    expect(build).toContain("const RUNTIME_CLIENT_OUT_FILE = join(OUT_DIR, 'runtime-client.js')")
    expect(runtime).toContain(':/opt/dorka/out/dorkad/runtime-client.js`')
    expect(runtime).toContain("import {RuntimeClient} from './out/dorkad/runtime-client.js'")
    expect(runtime).toContain("rpc(current.pairing, 'terminal.read'")
    expect(runtime).not.toContain("'out/cli/index.js'")
  })

  it('pulls registry bases without trying to pull the local fixture base', () => {
    const common = { tag: 'acceptance:latest', label: 'dev.dorka.acceptance-run=test' }
    expect(acceptanceBuildArgs({ ...common, file: 'docker/computer/Dockerfile' })).toContain(
      '--pull'
    )
    expect(
      acceptanceBuildArgs({
        ...common,
        file: 'tests/e2e/fixtures/dorka-native-linux-computer/Dockerfile',
        pull: false
      })
    ).not.toContain('--pull')
  })

  it('normalizes rootless Podman and isolated Docker engine facts', () => {
    expect(
      acceptanceEngineFacts({
        host: { arch: 'amd64', os: 'linux', security: { rootless: true } },
        store: { graphRoot: '/home/user/.local/share/containers/storage' }
      })
    ).toEqual({
      arch: 'amd64',
      os: 'linux',
      rootless: true,
      storeRoot: '/home/user/.local/share/containers/storage'
    })
    expect(
      acceptanceEngineFacts({
        Architecture: 'x86_64',
        OSType: 'linux',
        SecurityOptions: ['name=seccomp,profile=builtin'],
        DockerRootDir: '/var/lib/docker'
      })
    ).toEqual({ arch: 'amd64', os: 'linux', rootless: false, storeRoot: '/var/lib/docker' })
  })

  it('uses bounded disposable names and exact cleanup targets', () => {
    const names = acceptanceNames(
      { GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '3' },
      new Date('2026-01-02T03:04:05Z'),
      9
    )

    expect(names.run).toBe('dna-42-3-20260102030405000-9')
    expect(cleanupResourceNames(names)).toEqual([
      names.server,
      'dorka-computer-main',
      'dorka-computer-secondary',
      names.serverData,
      'dorka-computer-main-home',
      'dorka-computer-main-workspace',
      'dorka-computer-main-ssh-host-keys',
      'dorka-computer-secondary-home',
      'dorka-computer-secondary-workspace',
      'dorka-computer-secondary-ssh-host-keys',
      'dorka-runtimes',
      names.controlNetwork
    ])
  })

  it('proves requirement failures stop before terminal spawn', () => {
    const evidence = {
      beforeHandles: ['term-existing'],
      afterHandles: ['term-existing'],
      beforeMarkers: ['run-existing'],
      afterMarkers: ['run-existing'],
      expectedError: 'missing required skill',
      expectedRevision: 4,
      failure: new Error('Computer is missing required skill: native-acceptance'),
      run: { id: 'run-failed', status: 'failed', agentRevision: 4 }
    }

    expect(() => assertPreSpawnFailure(evidence)).not.toThrow()
    expect(() =>
      assertPreSpawnFailure({
        ...evidence,
        run: { ...evidence.run, terminalSessionId: 'term-spawned' }
      })
    ).toThrow(/crossed the terminal spawn boundary/)
    expect(() =>
      assertPreSpawnFailure({ ...evidence, afterHandles: ['term-existing', 'term-spawned'] })
    ).toThrow(/created a terminal/)
    expect(() =>
      assertPreSpawnFailure({ ...evidence, afterMarkers: ['run-existing', 'run-spawned'] })
    ).toThrow(/launched the Agent shim/)
  })

  it('uses the existing image and runtime RPC client for Agent requirements', () => {
    const fixture = readFileSync(
      resolve(
        import.meta.dirname,
        '../../tests/e2e/fixtures/dorka-native-linux-computer/native-linux-agent-requirements-acceptance.mjs'
      ),
      'utf8'
    )

    expect(fixture).toContain("rpc(pairing, 'agents.references.update'")
    expect(fixture).toContain("rpc(pairing, 'terminal.list', {})")
    expect(fixture).toContain('repositoryCreated: false')
    expect(fixture).not.toContain("'build'")
    expect(fixture).not.toContain("'computers.create'")
  })

  it('serializes fixed-name ownership with an engine-scoped invocation lock', () => {
    let lockToken: string | undefined
    const runEngine = (args: string[]) => {
      if (args[1] === 'create') {
        lockToken ??= args[3]?.split('=').at(-1)
        return { status: 0, stdout: `${args.at(-1)}\n`, stderr: '' }
      }
      if (args[1] === 'inspect') {
        return lockToken
          ? { status: 0, stdout: `${lockToken}\n`, stderr: '' }
          : { status: 1, stdout: '', stderr: 'volume not found' }
      }
      lockToken = undefined
      return { status: 0, stdout: args[2] ?? '', stderr: '' }
    }

    const first = acquireAcceptanceLock(runEngine, 'invocation-a')
    expect(() => acquireAcceptanceLock(runEngine, 'invocation-b')).toThrow(
      /owned by another invocation/
    )
    expect(lockToken).toBe('invocation-a')

    releaseAcceptanceLock(runEngine, first)
    expect(() => acquireAcceptanceLock(runEngine, 'invocation-b')).not.toThrow()
    expect(lockToken).toBe('invocation-b')
  })

  it('does not release a replacement lock owned by an interleaved invocation', () => {
    let removed = false
    const runEngine = (args: string[]) => {
      if (args[1] === 'inspect') {
        return { status: 0, stdout: 'invocation-b\n', stderr: '' }
      }
      removed = true
      return { status: 0, stdout: '', stderr: '' }
    }

    releaseAcceptanceLock(runEngine, {
      name: 'dorka-native-linux-acceptance-lock',
      token: 'invocation-a'
    })
    expect(removed).toBe(false)
  })

  it('does not clean fixed resources after a rejected preflight and prints its verdict', () => {
    const runtime = readFileSync(
      resolve(
        import.meta.dirname,
        '../../tests/e2e/fixtures/dorka-native-linux-computer/native-linux-acceptance-runtime.mjs'
      ),
      'utf8'
    )
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
    )

    expect(runtime).toContain('ownsRuntimeResources = false')
    expect(runtime.indexOf('engineFacts = preflight(names)')).toBeLessThan(
      runtime.indexOf('acceptanceLock = acquireAcceptanceLock(runEngineCommand, names.run)')
    )
    expect(runtime.indexOf('acceptanceLock = acquireAcceptanceLock')).toBeLessThan(
      runtime.lastIndexOf('requireFixedResourcesAvailable()')
    )
    expect(runtime.lastIndexOf('requireFixedResourcesAvailable()')).toBeLessThan(
      runtime.indexOf('ownsRuntimeResources = true')
    )
    expect(runtime).toContain('ownsRuntimeResources ? cleanup(names, artifacts) : []')
    expect(runtime).toContain("DORKA_NATIVE_LINUX_ACCEPTANCE=${failure ? 'FAIL' : 'PASS'}")
    expect(packageJson.scripts['test:e2e:dorka-native-linux:self-service']).toContain(
      'pnpm install --frozen-lockfile --ignore-scripts'
    )
  })

  it('redacts pairing credentials, tokens, and private keys', () => {
    const input =
      'dorka://pair?token=secret\n{"deviceToken":"secret","url":"dorka://pair?x"}\n-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----'
    const output = redactArtifact(input)

    expect(output).not.toContain('secret')
    expect(output).toContain('[REDACTED_PAIRING_URL]')
    expect(output).toContain('[REDACTED_PRIVATE_KEY]')
  })

  it('accepts only the exact generation, relay PTY, and PTY incarnation', () => {
    const { run, certificate } = fixture()

    expect(certificateMatchesRun(certificate, run)).toBe(true)
    expect(
      certificateMatchesRun({ ...certificate, computerExecutionGeneration: randomUUID() }, run)
    ).toBe(false)
    expect(
      certificateMatchesRun({ ...certificate, relayPtyId: `${certificate.relayPtyId}-wrong` }, run)
    ).toBe(false)
    expect(certificateMatchesRun({ ...certificate, ptyIncarnationId: randomUUID() }, run)).toBe(
      false
    )
  })

  it('dispatches acceptance without the unrelated desktop jobs', () => {
    const workflow = parse(
      readFileSync(resolve(import.meta.dirname, '../../.github/workflows/computer-e2e.yml'), 'utf8')
    )

    expect(workflow.on.workflow_dispatch.inputs.native_linux_acceptance).toMatchObject({
      type: 'boolean',
      default: false
    })
    expect(workflow.jobs['native-linux-acceptance'].if).toContain(
      'inputs.native_linux_acceptance == true'
    )
    for (const name of ['mac-native-owner-smoke', 'linux', 'windows']) {
      expect(workflow.jobs[name].if, name).toContain('inputs.native_linux_acceptance != true')
    }
  })

  it('fails closed for missing, corrupt, changed-host, and mismatched evidence', () => {
    const { run } = fixture()
    for (const fault of [
      'missing-journal',
      'corrupt-journal',
      'changed-host-key',
      'wrong-generation',
      'wrong-incarnation'
    ]) {
      expect(() => assertUnverifiable(run, { ...run })).not.toThrow()
      expect(() => assertUnverifiable(run, { ...run, status: 'waiting' }), fault).toThrow(
        /changed status/
      )
      expect(() => assertUnverifiable(run, { ...run, finishedAt: 2 }), fault).toThrow(
        /invented finishedAt/
      )
    }
  })
})
