import { describe, expect, it } from 'vitest'
import {
  allowsArtifactCloudAuthOverride,
  resolveArtifactCloudApiUrl
} from './artifact-cloud-config'

describe('resolveArtifactCloudApiUrl', () => {
  it('uses the first-party production origin by default', () => {
    expect(resolveArtifactCloudApiUrl(undefined, {}, true)).toBe('https://share.ondorka.dev')
  })

  it('allows loopback HTTP only in development', () => {
    expect(
      resolveArtifactCloudApiUrl(
        undefined,
        { DORKA_ARTIFACTS_API_URL: 'http://127.0.0.1:45961' },
        false
      )
    ).toBe('http://127.0.0.1:45961')
    expect(() => resolveArtifactCloudApiUrl('http://127.0.0.1:45961', {}, true)).toThrow(/HTTPS/)
  })

  it('rejects origins that could receive an Dorka access token', () => {
    expect(() => resolveArtifactCloudApiUrl('https://example.com', {}, false)).toThrow(
      /ondorka\.dev/
    )
    expect(() => resolveArtifactCloudApiUrl('https://share.ondorka.dev/path', {}, false)).toThrow(
      /origin/
    )
  })

  it('allows auth token overrides only in non-production development builds', () => {
    expect(allowsArtifactCloudAuthOverride({}, false)).toBe(true)
    expect(allowsArtifactCloudAuthOverride({ NODE_ENV: 'production' }, false)).toBe(false)
    expect(allowsArtifactCloudAuthOverride({}, true)).toBe(false)
  })
})
