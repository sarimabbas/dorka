import * as NodeFs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fsyncSyncMock } = vi.hoisted(() => ({ fsyncSyncMock: vi.fn() }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>()
  return { ...actual, fsyncSync: fsyncSyncMock }
})

import { ManagedPtyExitJournal } from './managed-pty-exit-journal'

const describeDirectoryFsync = process.platform === 'win32' ? describe.skip : describe

describeDirectoryFsync('ManagedPtyExitJournal directory durability', () => {
  let temporaryRoot: string

  beforeEach(async () => {
    temporaryRoot = NodeFs.mkdtempSync(join(tmpdir(), 'dorka-managed-pty-exit-fsync-'))
    const actual = await vi.importActual<typeof NodeFs>('node:fs')
    fsyncSyncMock.mockReset().mockImplementation((descriptor: number) => {
      actual.fsyncSync(descriptor)
    })
  })

  afterEach(() => {
    NodeFs.rmSync(temporaryRoot, { recursive: true, force: true })
  })

  it('syncs each journal directory, the v1 root, and its parent after first-use mkdir', () => {
    new ManagedPtyExitJournal(join(temporaryRoot, 'managed-pty-exits', 'v1'))

    expect(fsyncSyncMock).toHaveBeenCalledTimes(5)
  })

  it('fails composition when required directory fsync is unsupported', () => {
    fsyncSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('directory fsync unsupported'), { code: 'EINVAL' })
    })

    expect(() => new ManagedPtyExitJournal(join(temporaryRoot, 'managed-pty-exits', 'v1'))).toThrow(
      'directory fsync unsupported'
    )
  })
})
