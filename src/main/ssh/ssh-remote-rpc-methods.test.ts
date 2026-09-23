import { describe, expect, it } from 'vitest'
import { ACCOUNT_METHODS } from '../runtime/rpc/methods/accounts'
import { ARTIFACT_METHODS } from '../runtime/rpc/methods/artifacts'
import { PLUGIN_METHODS } from '../runtime/rpc/methods/plugins'
import { SSH_REMOTE_RPC_METHODS } from './ssh-remote-rpc-methods'

function names(methods: readonly { name: string }[]): string[] {
  return methods.map((method) => method.name)
}

describe('SSH remote CLI RPC manifest', () => {
  it('contains only the compatibility command families it dispatches', () => {
    const exposed = new Set(names(SSH_REMOTE_RPC_METHODS))
    const unrelated = names([...ACCOUNT_METHODS, ...ARTIFACT_METHODS, ...PLUGIN_METHODS])

    expect([...exposed]).toEqual(
      expect.arrayContaining([
        'status.get',
        'terminal.list',
        'orchestration.send',
        'orchestration.check',
        'linear.issueContext'
      ])
    )
    expect(unrelated.filter((name) => exposed.has(name))).toEqual([])
  })
})
