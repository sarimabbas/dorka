import { describe, expect, it } from 'vitest'

import {
  DORKAD_SNAPSHOT_EXCLUDED,
  DORKAD_SNAPSHOT_MEMBERS,
  captureDorkadStateSnapshotCommand,
  newestStateMtimeCommand,
  dorkadSnapshotDirName,
  parseNewestStateMtimeSeconds,
  parseDorkadSnapshotCapture,
  parseDorkadSnapshotRestore,
  restoreDorkadStateSnapshotCommand
} from './dorkad-state-snapshot'
import { getRemoteHostPlatform } from './ssh-remote-platform'

const posix = getRemoteHostPlatform('linux-x64')
const windows = getRemoteHostPlatform('win32-x64')
const ROOT = '/home/u/.dorka'
const SNAP = '/home/u/.dorka-remote/dorkad-state-snapshots/pre-0.2.0+bb01-1000'

describe('capturing the pre-activation snapshot', () => {
  it('captures the profile state a rollback needs', () => {
    const command = captureDorkadStateSnapshotCommand(posix, ROOT, SNAP)
    for (const member of DORKAD_SNAPSHOT_MEMBERS) {
      expect(command).toContain(`'${member}'`)
    }
  })

  // The live daemon owns <root>/daemon and outlives every restart. Restoring a stale copy of
  // its socket, PID record and token would break the fence that keeps its terminals adoptable.
  it.each(DORKAD_SNAPSHOT_EXCLUDED)('never captures %s', (excluded) => {
    expect(captureDorkadStateSnapshotCommand(posix, ROOT, SNAP)).not.toContain(`'${excluded}'`)
  })

  it.each(DORKAD_SNAPSHOT_EXCLUDED)('never removes or restores over %s', (excluded) => {
    expect(restoreDorkadStateSnapshotCommand(posix, ROOT, SNAP)).not.toContain(`'${excluded}'`)
  })

  it('writes the archive under a temp name and renames, so a killed deploy leaves no torn tar', () => {
    const command = captureDorkadStateSnapshotCommand(posix, ROOT, SNAP)
    expect(command).toContain('.partial')
    expect(command.indexOf('tar -C')).toBeLessThan(command.indexOf('mv '))
  })

  it.each([
    ['CAPTURED', 'captured'],
    ['EMPTY', 'empty'],
    ['tar: broken', 'failed'],
    ['', 'failed']
  ])('parses %s as %s', (output, expected) => {
    expect(parseDorkadSnapshotCapture(output)).toBe(expected)
  })

  it('keys the snapshot dir on both version and time, so a retry cannot overwrite one', () => {
    expect(dorkadSnapshotDirName('0.2.0+bb01', 1000)).not.toBe(
      dorkadSnapshotDirName('0.2.0+bb01', 2000)
    )
  })
})

describe('restoring the snapshot', () => {
  it('clears the members before extracting, so files the new build added do not survive', () => {
    const command = restoreDorkadStateSnapshotCommand(posix, ROOT, SNAP)
    expect(command.indexOf('rm -rf')).toBeLessThan(command.indexOf('tar -C'))
  })

  it('reports a missing archive instead of extracting nothing and claiming success', () => {
    expect(restoreDorkadStateSnapshotCommand(posix, ROOT, SNAP)).toContain('echo MISSING')
    expect(parseDorkadSnapshotRestore('MISSING')).toBe('missing')
    expect(parseDorkadSnapshotRestore('RESTORED')).toBe('restored')
    expect(parseDorkadSnapshotRestore('FAILED')).toBe('failed')
  })
})

describe('detecting writes since activation', () => {
  it.each([
    ['1700000000', 1_700_000_000],
    ['UNKNOWN', null],
    ['', null]
  ])('parses %s', (output, expected) => {
    expect(parseNewestStateMtimeSeconds(output)).toBe(expected)
  })

  it('looks at the same members the snapshot covers', () => {
    const command = newestStateMtimeCommand(posix, ROOT)
    for (const member of DORKAD_SNAPSHOT_MEMBERS) {
      expect(command).toContain(`'${member}'`)
    }
  })
})

describe('Windows hosts', () => {
  it.each([
    ['capture', () => captureDorkadStateSnapshotCommand(windows, ROOT, SNAP)],
    ['restore', () => restoreDorkadStateSnapshotCommand(windows, ROOT, SNAP)],
    ['mtime', () => newestStateMtimeCommand(windows, ROOT)]
  ])('refuses %s rather than emitting a POSIX command', (_label, build) => {
    expect(build).toThrow('dorkad to a Windows host is not implemented')
  })
})
