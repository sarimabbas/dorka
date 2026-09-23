import type {
  DorkaCloudCapabilities,
  DorkaCloudOrgSummary,
  DorkaProfileCloudSummary
} from '../../shared/dorka-profiles'

export type DorkaCloudSessionExchangeResponse = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  cloud: DorkaProfileCloudSummary
  organizations?: DorkaCloudOrgSummary[]
  capabilities: DorkaCloudCapabilities
}
