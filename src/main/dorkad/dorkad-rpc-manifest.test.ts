import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DorkaRuntimeService } from '../runtime/dorka-runtime'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { ACCOUNT_METHODS } from '../runtime/rpc/methods/accounts'
import { ARTIFACT_METHODS } from '../runtime/rpc/methods/artifacts'
import {
  DORKAD_DISABLED_RUNTIME_CAPABILITIES,
  DORKAD_RPC_METHODS
} from '../runtime/rpc/methods/dorkad'
import { ALL_RPC_METHODS } from '../runtime/rpc/methods'
import { PLUGIN_METHODS } from '../runtime/rpc/methods/plugins'

const OMITTED_METHODS = [...ARTIFACT_METHODS, ...ACCOUNT_METHODS, ...PLUGIN_METHODS]

function names(methods: readonly { name: string }[]): string[] {
  return methods.map((method) => method.name)
}

describe('dorkad RPC manifest', () => {
  it('removes only the unconfigured method families from the full host', () => {
    const dorkadNames = new Set(names(DORKAD_RPC_METHODS))
    const omittedNames = new Set(names(OMITTED_METHODS))

    expect(names(ALL_RPC_METHODS).filter((name) => !dorkadNames.has(name))).toEqual(
      names(OMITTED_METHODS)
    )
    expect([...dorkadNames].filter((name) => omittedNames.has(name))).toEqual([])
    expect(DORKAD_DISABLED_RUNTIME_CAPABILITIES).toEqual([
      'accounts.import-host-credentials.v1',
      'accounts.codex-reset-credit.v1'
    ])
    expect([...dorkadNames]).toEqual(
      expect.arrayContaining([
        'github.prForBranch',
        'agents.sourceControl.status',
        'agents.sourceControl.reviewDiff',
        'linear.listIssues',
        'pairing.getEndpoints',
        'orchestration.runCreate'
      ])
    )
  })

  it('advertises agent execution and source control only with their shared host composition', () => {
    const entry = readFileSync(new URL('./dorkad-entry.ts', import.meta.url), 'utf8')
    const composition = readFileSync(
      new URL('./dorkad-computer-agent-execution.ts', import.meta.url),
      'utf8'
    )

    expect(DORKAD_DISABLED_RUNTIME_CAPABILITIES).not.toContain('agents.execution.v1')
    expect(entry).toContain('createDorkadComputerAgentExecution(')
    expect(entry).toContain('...computerAgentExecution.runtimeDependencies')
    expect(composition).toContain('agentExecutionService: service')
    expect(composition).toContain('computerRunSourceControl: sourceControl')
    expect(composition).toContain('computerGitIdentity: gitIdentity')
    expect(entry).toContain('computerAgentExecution?.disconnectAll()')
    expect(composition.match(/createManagedComputerHostProjector\(/g)).toHaveLength(1)
    expect(composition).toContain(
      'createManagedComputerAgentTerminalLauncher({ host, privateDirectory, runtime })'
    )
    expect(composition).toContain("'server'")
    expect(composition).toContain('new ComputerRunSourceControl({')
    expect(composition).toContain('new ComputerGitIdentityManager({ computers, host })')
    expect(composition).toContain('host\n      })')
  })

  it('answers omitted methods without disconnecting an older client', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these dispatches only read the runtime ID.
    const runtime = { getRuntimeId: () => 'dorkad-test' } as DorkaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: DORKAD_RPC_METHODS })

    for (const method of ['artifacts.list', 'accounts.list', 'plugins.list']) {
      await expect(
        dispatcher.dispatch({ id: method, authToken: 'test', method })
      ).resolves.toMatchObject({ ok: false, error: { code: 'method_not_found' } })
    }
    await expect(
      dispatcher.dispatch({ id: 'still-connected', authToken: 'test', method: 'host.platform' })
    ).resolves.toMatchObject({ ok: true, result: { platform: process.platform } })
  })
})
