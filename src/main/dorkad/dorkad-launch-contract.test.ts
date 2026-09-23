/**
 * The two things a supervisor reads off a launch: what the arguments mean, and what an exit
 * code means. Both are part of the ops contract in docs/reference/dorkad-operations.md.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  DORKAD_EXIT_CONFIGURATION,
  DORKAD_EXIT_FAILED,
  parseArgs,
  resolveDorkadExitCode
} from './dorkad-entry'
import { startDorkadWithLifecycle } from './dorkad-lifecycle'
import { DorkadBindAddressError } from './dorkad-bind-address'
import { DorkadInstanceLockError } from './dorkad-instance-lock'

describe('parseArgs', () => {
  it('accepts --bind and leaves it unset when absent', () => {
    expect(parseArgs(['--bind', '0.0.0.0'])).toEqual({ bind: '0.0.0.0' })
    expect(parseArgs([])).toEqual({})
    expect(parseArgs(['--port', '6768', '--bind', '10.0.0.5', '--json'])).toEqual({
      port: 6768,
      bind: '10.0.0.5',
      json: true
    })
  })

  it('rejects --bind with no value rather than silently binding the default', () => {
    expect(() => parseArgs(['--bind'])).toThrow('--bind expects a value')
    expect(() => parseArgs(['--bind', '--json'])).not.toThrow()
  })
})

describe('resolveDorkadExitCode', () => {
  it('separates a configuration fault from a generic failure', () => {
    // A supervisor must be able to stop restarting on faults that restarting cannot fix:
    // a data root owned by someone else, held by another instance, or a bad bind address.
    expect(
      resolveDorkadExitCode(new DorkadInstanceLockError('dorkad_instance_lock_held', 'held'))
    ).toBe(DORKAD_EXIT_CONFIGURATION)
    expect(resolveDorkadExitCode(new DorkadBindAddressError('bad'))).toBe(DORKAD_EXIT_CONFIGURATION)
    expect(resolveDorkadExitCode(new Error('port in use'))).toBe(DORKAD_EXIT_FAILED)
    expect(DORKAD_EXIT_CONFIGURATION).not.toBe(DORKAD_EXIT_FAILED)
  })
})

describe('dorkad lifecycle cleanup', () => {
  it('uninstalls registered runtime resources when startup fails', async () => {
    const cleanupRuntime = vi.fn(async () => {})
    const cleanupHost = vi.fn(async () => {})

    await expect(
      startDorkadWithLifecycle(async (registerCleanup) => {
        registerCleanup(cleanupRuntime)
        await Promise.resolve()
        throw new Error('startup failed')
      }, cleanupHost)
    ).rejects.toThrow('startup failed')

    expect(cleanupRuntime).toHaveBeenCalledOnce()
    expect(cleanupHost).toHaveBeenCalledOnce()
  })

  it('preserves the startup error when rollback also fails', async () => {
    const startupError = new Error('bind failed')
    const cleanupError = new Error('daemon stop failed')
    const cleanupRuntime = vi.fn(async () => {})
    const cleanupHost = vi.fn(async () => {
      throw cleanupError
    })
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await expect(
        startDorkadWithLifecycle(async (registerCleanup) => {
          registerCleanup(cleanupRuntime)
          throw startupError
        }, cleanupHost)
      ).rejects.toBe(startupError)
      expect(report).toHaveBeenCalledWith('[dorkad] startup cleanup failed:', cleanupError)
    } finally {
      report.mockRestore()
    }
  })

  it('coalesces concurrent and repeated normal stops', async () => {
    const cleanupRuntime = vi.fn(async () => {})
    const cleanupHost = vi.fn(async () => {})
    const handle = await startDorkadWithLifecycle(async (registerCleanup) => {
      registerCleanup(cleanupRuntime)
      return { readiness: 'ready' }
    }, cleanupHost)

    await Promise.all([handle.stop(), handle.stop()])
    await handle.stop()

    expect(cleanupRuntime).toHaveBeenCalledOnce()
    expect(cleanupHost).toHaveBeenCalledOnce()
  })
})
