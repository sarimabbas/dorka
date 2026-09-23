import { describe, expect, it } from 'vitest'
import {
  encodeClaudeProjectPath,
  encodeClaudeProjectPaths,
  isClaudeProjectDirInScope
} from './claude-project-dir-encoding'

describe('encodeClaudeProjectPath', () => {
  it('emits one dash per non-alphanumeric character rather than per run', () => {
    // The distinction is the whole contract: collapsing runs stops matching real bucket names.
    expect(encodeClaudeProjectPath('/Users/ada/dorka/workspaces')).toBe(
      '-Users-ada-dorka-workspaces'
    )
    expect(encodeClaudeProjectPath('/Users/ada/.dorka/worktrees')).toBe(
      '-Users-ada--dorka-worktrees'
    )
  })

  it('encodes a Windows drive path', () => {
    expect(encodeClaudeProjectPath('C:\\Users\\ada\\dorka\\workspaces')).toBe(
      'C--Users-ada-dorka-workspaces'
    )
    expect(encodeClaudeProjectPath('C:\\')).toBe('C--')
  })

  it('encodes a WSL UNC path', () => {
    expect(encodeClaudeProjectPath('\\\\wsl$\\Ubuntu\\home\\ada\\dorka\\workspaces')).toBe(
      '--wsl--Ubuntu-home-ada-dorka-workspaces'
    )
  })

  it('drops trailing separators but keeps a bare root', () => {
    expect(encodeClaudeProjectPath('/Users/ada/dorka/')).toBe('-Users-ada-dorka')
    expect(encodeClaudeProjectPath('/')).toBe('-')
  })

  it('offers the NFC spelling alongside the raw one', () => {
    const nfd = '/Users/ada/cafe\u0301'
    expect(encodeClaudeProjectPaths(nfd)).toEqual([
      encodeClaudeProjectPath(nfd),
      encodeClaudeProjectPath(nfd.normalize('NFC'))
    ])
    expect(encodeClaudeProjectPaths('/Users/ada/cafe')).toEqual(['-Users-ada-cafe'])
  })
})

describe('isClaudeProjectDirInScope', () => {
  it('accepts the prefix itself and its dash-delimited descendants', () => {
    expect(isClaudeProjectDirInScope('-w-dorka', ['-w-dorka'])).toBe(true)
    expect(isClaudeProjectDirInScope('-w-dorka-nautilus', ['-w-dorka'])).toBe(true)
  })

  it('rejects a sibling that merely starts with the prefix', () => {
    // Without the boundary, "dorka" would absorb every workspace under "dorkadyne".
    expect(isClaudeProjectDirInScope('-w-dorkadyne-nautilus', ['-w-dorka'])).toBe(false)
  })
})
