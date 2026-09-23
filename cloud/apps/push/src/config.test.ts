import { generateKeyPairSync } from 'node:crypto'
import { PUSH_DEFAULTS } from '@dorka-cloud/push-contract'
import { describe, expect, it } from 'vitest'
import { loadPushConfig, PUSH_DATABASE_POOL_MAX } from './config.js'

function apnsKeyPem(): string {
  return generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  }).privateKey
}

const MINIMAL = {
  DORKA_PUSH_PUBLIC_URL: 'https://push.ondorka.dev',
  DORKA_PUSH_FCM_PROJECT_ID: 'ondorka-cloud'
}

describe('push gateway config', () => {
  it('applies the documented defaults', () => {
    expect(loadPushConfig(MINIMAL)).toEqual({
      mode: 'active',
      port: 8080,
      publicUrl: 'https://push.ondorka.dev',
      databaseUrl: undefined,
      dataDir: './data/push',
      databasePoolMax: PUSH_DATABASE_POOL_MAX,
      apns: undefined,
      apnsTopic: PUSH_DEFAULTS.apnsTopic,
      fcmProjectId: 'ondorka-cloud',
      trustedProxyHops: 0
    })
  })

  it('reads a full APNs credential and the overridable knobs', () => {
    const keyPem = apnsKeyPem()
    const config = loadPushConfig({
      ...MINIMAL,
      PORT: '9090',
      DORKA_PUSH_DATABASE_URL: 'postgres://localhost/dorka_push',
      DORKA_PUSH_DATA_DIR: '/var/lib/push',
      DORKA_PUSH_APNS_KEY: keyPem,
      DORKA_PUSH_APNS_KEY_ID: 'ABCDE12345',
      DORKA_PUSH_APPLE_TEAM_ID: 'TEAM123456',
      DORKA_PUSH_APNS_TOPIC: 'com.stably.dorka.mobile.dev',
      DORKA_PUSH_FCM_PROJECT_ID: 'ondorka-staging',
      DORKA_PUSH_TRUSTED_PROXY_HOPS: '1'
    })
    expect(config).toMatchObject({
      port: 9090,
      databaseUrl: 'postgres://localhost/dorka_push',
      dataDir: '/var/lib/push',
      apns: { keyPem, keyId: 'ABCDE12345', teamId: 'TEAM123456' },
      apnsTopic: 'com.stably.dorka.mobile.dev',
      trustedProxyHops: 1,
      fcmProjectId: 'ondorka-staging'
    })
  })

  it('requires an explicit FCM project instead of silently targeting production', () => {
    expect(() => loadPushConfig({ ...MINIMAL, DORKA_PUSH_FCM_PROJECT_ID: undefined })).toThrow()
    expect(() => loadPushConfig({ ...MINIMAL, DORKA_PUSH_FCM_PROJECT_ID: ' ' })).toThrow()
  })

  it('refuses a partial APNs credential', () => {
    expect(() => loadPushConfig({ ...MINIMAL, DORKA_PUSH_APNS_KEY: apnsKeyPem() })).toThrow(
      'configured together'
    )
    expect(() =>
      loadPushConfig({
        ...MINIMAL,
        DORKA_PUSH_APNS_KEY: 'not-a-pem',
        DORKA_PUSH_APNS_KEY_ID: 'ABCDE12345',
        DORKA_PUSH_APPLE_TEAM_ID: 'TEAM123456'
      })
    ).toThrow('PEM text')
  })

  it('requires a canonical HTTPS origin outside loopback', () => {
    expect(() =>
      loadPushConfig({ ...MINIMAL, DORKA_PUSH_PUBLIC_URL: 'https://push.ondorka.dev/v1' })
    ).toThrow('must be an origin')
    expect(() =>
      loadPushConfig({ ...MINIMAL, DORKA_PUSH_PUBLIC_URL: 'http://push.ondorka.dev' })
    ).toThrow('must use HTTPS')
    expect(
      loadPushConfig({ ...MINIMAL, DORKA_PUSH_PUBLIC_URL: 'http://localhost:8080' }).publicUrl
    ).toBe('http://localhost:8080')
  })

  it('treats an empty optional variable as unset', () => {
    expect(
      loadPushConfig({ ...MINIMAL, DORKA_PUSH_DATABASE_URL: '', DORKA_PUSH_APNS_KEY_ID: '' })
    ).toMatchObject({ databaseUrl: undefined, apns: undefined })
  })
})

it('treats blank defaulted environment settings as absent', () => {
  const blanks = Object.fromEntries(
    [
      'PORT',
      'DORKA_PUSH_DATA_DIR',
      'DORKA_PUSH_APNS_TOPIC',
      'DORKA_PUSH_DATABASE_POOL_MAX',
      'DORKA_PUSH_TRUSTED_PROXY_HOPS'
    ].map((key) => [key, ' '])
  )
  expect(loadPushConfig({ ...MINIMAL, ...blanks })).toEqual(loadPushConfig(MINIMAL))
})
