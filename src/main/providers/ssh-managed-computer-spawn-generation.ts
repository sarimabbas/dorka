import { isComputerExecutionGeneration } from '../../shared/computer-runtime'
import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'

export async function assertSshManagedComputerSpawnGeneration(args: {
  mux: SshChannelMultiplexer
  expectedGeneration: string
  signal?: AbortSignal
}): Promise<void> {
  if (!isComputerExecutionGeneration(args.expectedGeneration)) {
    throw new Error('Computer relay execution generation is unverifiable')
  }
  const value = await args.mux.request('pty.getCapabilities', undefined, {
    signal: args.signal,
    timeoutMs: 5_000
  })
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('managedPtySpawnGenerationFenceVersion' in value) ||
    value.managedPtySpawnGenerationFenceVersion !== 1 ||
    !('computerExecutionGeneration' in value) ||
    value.computerExecutionGeneration !== args.expectedGeneration
  ) {
    throw new Error('Computer relay execution generation is unverifiable')
  }
}
