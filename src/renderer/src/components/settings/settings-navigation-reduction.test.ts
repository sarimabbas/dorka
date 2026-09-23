import { describe, expect, it } from 'vitest'
import { filterVisibleDorkaSettingsSections } from './settings-navigation-foundations'
import {
  getRuntimeEnvironmentsSearchEntry,
  getWebRuntimeEnvironmentsSearchEntry
} from './runtime-environments-search'

const RETAINED_SECTION_IDS = [
  'general',
  'appearance',
  'terminal',
  'agents',
  'orchestration',
  'computer-use',
  'automations',
  'notifications',
  'privacy',
  'advanced',
  'servers'
]

const REMOVED_SECTION_IDS = [
  'accounts',
  'integrations',
  'linear',
  'tasks',
  'quick-commands',
  'ssh',
  'dorka-account',
  'mobile',
  'mobile-emulator',
  'voice',
  'plugins',
  'repo-project'
]

describe('reduced Dorka settings navigation', () => {
  it('retains only the agreed visible settings sections', () => {
    const sections = [...RETAINED_SECTION_IDS, ...REMOVED_SECTION_IDS].map((id) => ({ id }))

    expect(filterVisibleDorkaSettingsSections(sections).map((section) => section.id)).toEqual(
      RETAINED_SECTION_IDS
    )
  })

  it('keeps eliminated sections out regardless of source order', () => {
    const sections = REMOVED_SECTION_IDS.map((id) => ({ id }))

    expect(filterVisibleDorkaSettingsSections(sections)).toEqual([])
  })

  it('limits remote server search metadata to direct pairing', () => {
    for (const entry of [
      getRuntimeEnvironmentsSearchEntry(),
      getWebRuntimeEnvironmentsSearchEntry()
    ]) {
      const searchableText = [entry.title, entry.description, ...(entry.keywords ?? [])]
        .join(' ')
        .toLowerCase()

      expect(searchableText).toContain('pair')
      expect(searchableText).not.toMatch(/cloud|mobile|relay|share/)
    }
  })
})
