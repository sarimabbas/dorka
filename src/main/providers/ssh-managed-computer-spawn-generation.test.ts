import { describe, expect, it } from 'vitest'
import { AGENT_SESSION_CREATE_OPERATION_PROTOCOL_VERSION } from '../../shared/agent-session-host-authority'
import { createMockMux } from './ssh-pty-provider-mock-multiplexer'
import { SshPtyProvider } from './ssh-pty-provider'

const GENERATION_1 = '10000000-0000-4000-8000-000000000001'
const GENERATION_2 = '20000000-0000-4000-8000-000000000002'
const OPERATION_ID = 'a'.repeat(43)

function capabilities(generation: string) {
  return {
    agentSessionCreateOperationVersion: AGENT_SESSION_CREATE_OPERATION_PROTOCOL_VERSION,
    durableExitEvidenceVersion: 1,
    managedPtySpawnGenerationFenceVersion: 1,
    computerExecutionGeneration: generation
  }
}

describe('SSH managed Computer spawn generation fence', () => {
  it('refuses a replacement relay between the outer check and exact spawn', async () => {
    const mux = createMockMux()
    mux.request.mockImplementation(async (method: string) => {
      if (method === 'pty.getCapabilities') {
        return capabilities(GENERATION_2)
      }
      throw new Error(`unexpected request: ${method}`)
    })
    const provider = new SshPtyProvider('runtime-ssh-computer-alpha', mux as never)

    await expect(
      provider.spawn({
        cols: 80,
        rows: 24,
        agentSessionCreateOperationId: OPERATION_ID,
        expectedComputerExecutionGeneration: GENERATION_1
      })
    ).rejects.toThrow('generation is unverifiable')

    expect(mux.request.mock.calls.map((call) => call[0])).toEqual([
      'pty.getCapabilities',
      'pty.getCapabilities'
    ])
    expect(mux.request).not.toHaveBeenCalledWith('pty.spawn', expect.anything())
  })

  it('refuses a relay that predates the atomic fence without spawning', async () => {
    const mux = createMockMux()
    mux.request.mockResolvedValue({
      agentSessionCreateOperationVersion: AGENT_SESSION_CREATE_OPERATION_PROTOCOL_VERSION,
      durableExitEvidenceVersion: 1,
      computerExecutionGeneration: GENERATION_1
    })
    const provider = new SshPtyProvider('runtime-ssh-computer-alpha', mux as never)

    await expect(
      provider.spawn({
        cols: 80,
        rows: 24,
        agentSessionCreateOperationId: OPERATION_ID,
        expectedComputerExecutionGeneration: GENERATION_1
      })
    ).rejects.toThrow('generation is unverifiable')
    expect(mux.request).not.toHaveBeenCalledWith('pty.spawn', expect.anything())
  })

  it('sends the expected generation on the exact provider request', async () => {
    const mux = createMockMux()
    mux.request.mockImplementation(async (method: string) => {
      if (method === 'pty.getCapabilities') {
        return capabilities(GENERATION_1)
      }
      if (method === 'pty.spawn') {
        return {
          id: 'pty-1',
          incarnationId: '30000000-0000-4000-8000-000000000003'
        }
      }
      return undefined
    })
    const provider = new SshPtyProvider('runtime-ssh-computer-alpha', mux as never)

    await expect(
      provider.spawn({
        cols: 80,
        rows: 24,
        agentSessionCreateOperationId: OPERATION_ID,
        expectedComputerExecutionGeneration: GENERATION_1
      })
    ).resolves.toMatchObject({ id: 'ssh:runtime-ssh-computer-alpha@@pty-1' })

    expect(mux.request).toHaveBeenLastCalledWith(
      'pty.spawn',
      expect.objectContaining({
        agentSessionCreateOperationId: OPERATION_ID,
        expectedComputerExecutionGeneration: GENERATION_1
      }),
      expect.any(Object)
    )
  })

  it('keeps generic and old-client SSH spawns unchanged', async () => {
    const mux = createMockMux()
    mux.request.mockResolvedValue({ id: 'pty-1', incarnationId: 'incarnation-1' })
    const provider = new SshPtyProvider('generic-target', mux as never)

    await provider.spawn({ cols: 80, rows: 24 })

    expect(mux.request.mock.calls.map((call) => call[0])).toEqual(['pty.spawn'])
    expect(mux.request.mock.calls[0]?.[1]).not.toHaveProperty('expectedComputerExecutionGeneration')
  })
})
