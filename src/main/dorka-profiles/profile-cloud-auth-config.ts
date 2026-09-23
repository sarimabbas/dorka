import { app } from 'electron'
import {
  cleanCloudServiceUrl as cleanUrl,
  cleanCloudServiceOrigin as cleanOrigin
} from '../../shared/cloud-service-url'
import { resolvePushGatewayOrigin } from '../runtime/push/push-gateway-origin'

export type DorkaCloudAuthConfig = {
  apiBaseUrl: string
  authorizeEndpoint: string
  sessionEndpoint: string
  refreshEndpoint: string
  capabilitiesEndpoint: string
  profileEndpoint: string
  orgEndpoint: string
  logoutEndpoint: string
  relayTokenEndpoint: string
  relayDirectorUrl: string
  clientId: string
  scope: string
}

const DEFAULT_SCOPE = 'openid profile email offline_access'
const PRODUCTION_API_BASE_URL = 'https://login.ondorka.dev'
const PRODUCTION_CLIENT_ID = 'dorka-desktop'
const PRODUCTION_RELAY_DIRECTOR_URL = 'https://relay.ondorka.dev'

// Why: packaged main bundles never define NODE_ENV, so packaged-ness is the
// only reliable production signal for gating dev-only auth escape hatches.
function isPackagedDorkaBuild(): boolean {
  try {
    return app?.isPackaged === true
  } catch {
    return false
  }
}

function endpoint(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString()
}

export function getDorkaCloudAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedDorkaBuild()
): { configured: true; config: DorkaCloudAuthConfig } | { configured: false; setupMessage: string } {
  // Why: loopback HTTP endpoints are a local-development convenience only;
  // packaged builds must not accept plain-HTTP token endpoints via env vars.
  const allowLoopbackHttp = !packaged
  const cleanEndpointUrl = (value: string | undefined): string | null =>
    cleanUrl(value, allowLoopbackHttp)
  const configuredApiBaseUrl = env.DORKA_CLOUD_API_URL?.trim()
  // Why: packaged releases cannot depend on launch-time environment injection;
  // these first-party endpoints and the public OAuth client ID are not secrets.
  const apiBaseUrl = configuredApiBaseUrl
    ? cleanEndpointUrl(configuredApiBaseUrl)
    : packaged
      ? PRODUCTION_API_BASE_URL
      : null
  const clientId = env.DORKA_CLOUD_CLIENT_ID?.trim() || (packaged ? PRODUCTION_CLIENT_ID : undefined)
  if (!apiBaseUrl || !clientId) {
    return {
      configured: false,
      setupMessage: 'Dorka Cloud sign-in is not configured for this build.'
    }
  }

  const authBaseUrl = cleanEndpointUrl(env.DORKA_CLOUD_AUTH_URL) ?? apiBaseUrl
  return {
    configured: true,
    config: {
      apiBaseUrl,
      authorizeEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_AUTHORIZE_URL) ??
        endpoint(authBaseUrl, '/v1/desktop/auth/authorize'),
      sessionEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_SESSION_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/session'),
      refreshEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_REFRESH_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/refresh'),
      capabilitiesEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_CAPABILITIES_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/capabilities'),
      profileEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_PROFILE_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/profile'),
      orgEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_ORG_URL) ?? endpoint(apiBaseUrl, '/v1/desktop/auth/org'),
      logoutEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_LOGOUT_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/logout'),
      relayTokenEndpoint:
        cleanEndpointUrl(env.DORKA_CLOUD_RELAY_TOKEN_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/relay-token'),
      relayDirectorUrl:
        cleanOrigin(env.DORKA_RELAY_URL, allowLoopbackHttp) ?? PRODUCTION_RELAY_DIRECTOR_URL,
      clientId,
      scope: env.DORKA_CLOUD_AUTH_SCOPE?.trim() || DEFAULT_SCOPE
    }
  }
}

/**
 * Where the host registers phones for background push. Deliberately outside
 * DorkaCloudAuthConfig: the push gateway authenticates with the host keypair, so an
 * accountless host reaches it on exactly the same path as a signed-in one.
 */
export function getDorkaPushGatewayUrl(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedDorkaBuild()
): string {
  return resolvePushGatewayOrigin(env, packaged)
}

export function allowsPlaintextDorkaCloudSession(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedDorkaBuild()
): boolean {
  return (
    env.DORKA_CLOUD_ALLOW_PLAINTEXT_SESSION === '1' && env.NODE_ENV !== 'production' && !packaged
  )
}

export function isDorkaCloudDevAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedDorkaBuild()
): boolean {
  return env.DORKA_CLOUD_DEV_AUTH === '1' && env.NODE_ENV !== 'production' && !packaged
}
