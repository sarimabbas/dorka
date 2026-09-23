import { describe, expect, it } from 'vitest'
import {
  WORKTREE_CARD_PROPERTY_OPTIONS,
  getWorktreeCardPropertyOptions
} from './sidebar-workspace-option-items'

describe('worktree card property options', () => {
  it('keeps core workspace and Automation options without task-provider controls', () => {
    for (const options of [
      getWorktreeCardPropertyOptions(),
      getWorktreeCardPropertyOptions({ newCardStyle: true })
    ]) {
      expect(options.map((option) => option.id)).toContain('automation')
      expect(options.find((option) => option.id === 'automation')?.properties).toEqual([
        'automation'
      ])
      expect(options.map((option) => option.label)).toContain('Automation')
      expect(options.map((option) => option.id)).not.toEqual(
        expect.arrayContaining(['tasks', 'issue', 'linear-issue', 'jira-issue'])
      )
      expect(options.map((option) => option.label)).not.toEqual(
        expect.arrayContaining(['Tasks', 'GitHub issues', 'Linear issues', 'Jira issues'])
      )
    }

    expect(WORKTREE_CARD_PROPERTY_OPTIONS).toEqual(getWorktreeCardPropertyOptions())
  })

  it('uses branch-only copy by default and without project groups', () => {
    const defaultOptions = getWorktreeCardPropertyOptions()
    const newCardOptions = getWorktreeCardPropertyOptions({
      newCardStyle: true,
      hasProjectGroups: false
    })

    expect(defaultOptions.find((option) => option.id === 'branch')?.label).toBe('Branch name')
    expect(newCardOptions.find((option) => option.id === 'branch')?.label).toBe('Branch name')
  })

  it('keeps branch-only copy for legacy cards even with project groups', () => {
    const options = getWorktreeCardPropertyOptions({ hasProjectGroups: true })

    expect(options.find((option) => option.id === 'branch')?.label).toBe('Branch name')
  })

  it('mentions folder paths only for new card style with project groups', () => {
    const options = getWorktreeCardPropertyOptions({
      newCardStyle: true,
      hasProjectGroups: true
    })

    expect(options.find((option) => option.id === 'branch')?.label).toBe('Branch / folder path')
  })
})
