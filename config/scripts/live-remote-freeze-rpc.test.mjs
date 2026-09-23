import { describe, expect, it } from 'vitest'
import {
  appendDorkaRpcOutput,
  resolveDorkaCliCommand,
  resolveDorkaCliInvocation
} from './live-remote-freeze-rpc.mjs'

describe('live remote freeze RPC', () => {
  it('resolves the Dorka CLI for managed, dev, Linux, and default runtimes', () => {
    expect(resolveDorkaCliCommand({ env: { DORKA_CLI_COMMAND: 'custom-dorka' } })).toBe(
      'custom-dorka'
    )
    expect(resolveDorkaCliCommand({ env: { DORKA_DEV_REPO_ROOT: '/repo' } })).toBe('dorka-dev')
    expect(resolveDorkaCliCommand({ env: {}, platform: 'linux' })).toBe('dorka-ide')
    expect(resolveDorkaCliCommand({ env: {}, platform: 'win32' })).toBe('dorka')
  })

  it('bypasses the Windows dev cmd shim with the built Node CLI', () => {
    const invocation = resolveDorkaCliInvocation({
      env: {
        APPDATA: 'C:\\Users\\dev\\AppData\\Roaming',
        DORKA_CLI_COMMAND: 'C:\\repo\\out\\bin\\dorka-dev.cmd',
        DORKA_DEV_REPO_ROOT: 'C:\\repo'
      },
      platform: 'win32',
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe'
    })

    expect(invocation).toMatchObject({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      prefixArgs: ['C:\\repo\\out\\cli\\index.js'],
      env: {
        DORKA_USER_DATA_PATH: 'C:\\Users\\dev\\AppData\\Roaming\\dorka-dev',
        DORKA_DEV_CLI_INVOCATION: '1',
        DORKA_APP_EXECUTABLE: 'C:\\repo\\node_modules\\electron\\dist\\electron.exe',
        DORKA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1'
      }
    })
  })

  it('caps combined asynchronous output before retaining the overflow chunk', () => {
    const first = appendDorkaRpcOutput('', '1234', 0, 5)
    expect(first).toEqual({ output: '1234', bytes: 4, exceeded: false })

    const overflow = appendDorkaRpcOutput(first.output, '67', first.bytes, 5)
    expect(overflow).toEqual({ output: '1234', bytes: 6, exceeded: true })
  })
})
