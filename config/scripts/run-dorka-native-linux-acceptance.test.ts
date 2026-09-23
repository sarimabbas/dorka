import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  acceptanceEngineFacts,
  acceptanceNames,
  assertUnverifiable,
  certificateMatchesRun,
  cleanupResourceNames,
  redactArtifact
} from './run-dorka-native-linux-acceptance'
import { managedPtyExitCertificateId } from '../../src/shared/managed-pty-exit-evidence'

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
      names.serverData,
      'dorka-computer-main-home',
      'dorka-computer-main-workspace',
      'dorka-computer-main-ssh-host-keys',
      'dorka-runtimes',
      names.controlNetwork
    ])
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
