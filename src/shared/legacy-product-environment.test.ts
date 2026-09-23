import { describe, expect, it } from 'vitest'
import { migrateLegacyProductEnvironment } from './legacy-product-environment'

describe('legacy product environment', () => {
  it('uses ORCA_* only when the canonical DORKA_* variable is absent', () => {
    const environment = {
      ORCA_PORT: 'legacy',
      DORKA_PORT: 'canonical',
      ORCA_TOKEN: 'migrated'
    }

    migrateLegacyProductEnvironment(environment)

    expect(environment).toEqual({
      ORCA_PORT: 'legacy',
      DORKA_PORT: 'canonical',
      ORCA_TOKEN: 'migrated',
      DORKA_TOKEN: 'migrated'
    })
  })
})
