import { describe, expect, it, vi } from 'vitest'
import {
  allowsPlaintextDorkaCloudSession,
  getDorkaCloudAuthConfig,
  isDorkaCloudDevAuthEnabled
} from './profile-cloud-auth-config'

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

describe('Dorka cloud auth config', () => {
  it('reports unconfigured without both API URL and client ID', () => {
    expect(getDorkaCloudAuthConfig({})).toEqual({
      configured: false,
      setupMessage: 'Dorka Cloud sign-in is not configured for this build.'
    })
  })

  it('builds default desktop auth endpoints from the API URL', () => {
    const state = getDorkaCloudAuthConfig({
      DORKA_CLOUD_API_URL: 'https://dorka-cloud.example/',
      DORKA_CLOUD_CLIENT_ID: 'desktop-client'
    })

    expect(state).toEqual({
      configured: true,
      config: {
        apiBaseUrl: 'https://dorka-cloud.example',
        authorizeEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/authorize',
        sessionEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/session',
        refreshEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/refresh',
        capabilitiesEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/capabilities',
        profileEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/profile',
        orgEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/org',
        logoutEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/logout',
        relayTokenEndpoint: 'https://dorka-cloud.example/v1/desktop/auth/relay-token',
        relayDirectorUrl: 'https://relay.ondorka.dev',
        clientId: 'desktop-client',
        scope: 'openid profile email offline_access'
      }
    })
  })

  it('uses first-party production endpoints without runtime env in packaged builds', () => {
    expect(getDorkaCloudAuthConfig({}, true)).toEqual({
      configured: true,
      config: {
        apiBaseUrl: 'https://login.ondorka.dev',
        authorizeEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/authorize',
        sessionEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/session',
        refreshEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/refresh',
        capabilitiesEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/capabilities',
        profileEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/profile',
        orgEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/org',
        logoutEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/logout',
        relayTokenEndpoint: 'https://login.ondorka.dev/v1/desktop/auth/relay-token',
        relayDirectorUrl: 'https://relay.ondorka.dev',
        clientId: 'dorka-desktop',
        scope: 'openid profile email offline_access'
      }
    })
  })

  it('allows loopback HTTP endpoints for local desktop auth development', () => {
    const state = getDorkaCloudAuthConfig({
      DORKA_CLOUD_API_URL: 'http://localhost:4100',
      DORKA_CLOUD_CLIENT_ID: 'desktop-client'
    })

    expect(state.configured).toBe(true)
  })

  it('rejects loopback HTTP endpoints in packaged builds', () => {
    expect(
      getDorkaCloudAuthConfig(
        {
          DORKA_CLOUD_API_URL: 'http://localhost:4100',
          DORKA_CLOUD_CLIENT_ID: 'desktop-client'
        },
        true
      )
    ).toMatchObject({ configured: false })

    const httpsState = getDorkaCloudAuthConfig(
      {
        DORKA_CLOUD_API_URL: 'https://dorka-cloud.example',
        DORKA_CLOUD_CLIENT_ID: 'desktop-client'
      },
      true
    )
    expect(httpsState.configured).toBe(true)
  })

  it('rejects non-HTTPS non-loopback API URLs', () => {
    expect(
      getDorkaCloudAuthConfig({
        DORKA_CLOUD_API_URL: 'http://dorka-cloud.example',
        DORKA_CLOUD_CLIENT_ID: 'desktop-client'
      })
    ).toMatchObject({ configured: false })
  })

  it('allows dev plaintext sessions only outside production', () => {
    expect(
      allowsPlaintextDorkaCloudSession({
        DORKA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      allowsPlaintextDorkaCloudSession({
        DORKA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })

  it('ignores dev flags in packaged builds even without NODE_ENV', () => {
    // Why: packaged main bundles never define NODE_ENV, so packaged-ness must
    // gate the escape hatches on its own.
    expect(
      allowsPlaintextDorkaCloudSession({ DORKA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1' }, true)
    ).toBe(false)
    expect(isDorkaCloudDevAuthEnabled({ DORKA_CLOUD_DEV_AUTH: '1' }, true)).toBe(false)
  })

  it('allows local dev auth only outside production', () => {
    expect(
      isDorkaCloudDevAuthEnabled({
        DORKA_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      isDorkaCloudDevAuthEnabled({
        DORKA_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })
})
