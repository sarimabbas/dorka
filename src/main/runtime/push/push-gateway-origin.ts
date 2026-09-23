import { cleanCloudServiceOrigin } from '../../../shared/cloud-service-url'

export function resolvePushGatewayOrigin(env: NodeJS.ProcessEnv, packaged: boolean): string {
  return cleanCloudServiceOrigin(env.DORKA_PUSH_GATEWAY_URL, !packaged) ?? 'https://push.ondorka.dev'
}
