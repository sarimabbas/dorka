import { describe, expect, it } from 'vitest'
import { WORK_ITEM_DETAILS_UNAVAILABLE_MESSAGE } from './work-item-details'

describe('review details unavailable copy', () => {
  it('uses neutral Review wording instead of provider product chrome', () => {
    expect(WORK_ITEM_DETAILS_UNAVAILABLE_MESSAGE).toBe('Unable to load review details.')
    expect(WORK_ITEM_DETAILS_UNAVAILABLE_MESSAGE).not.toContain('GitHub')
  })
})
