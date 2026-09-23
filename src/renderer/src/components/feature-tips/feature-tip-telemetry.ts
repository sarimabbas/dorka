import { track } from '@/lib/telemetry'
import type { EventProps } from '../../../../shared/telemetry-events'

export type DorkaCliFeatureTipSource = EventProps<'dorka_cli_feature_tip_shown'>['source']
export type DorkaCliFeatureTipSetupResult =
  EventProps<'dorka_cli_feature_tip_setup_result'>['result']
export type CmdJPaletteFeatureTipSource = EventProps<'cmd_j_palette_feature_tip_shown'>['source']

export function getDorkaCliFeatureTipTelemetrySource(value: unknown): DorkaCliFeatureTipSource {
  return value === 'app_open' ? 'app_open' : 'manual'
}

export function trackDorkaCliFeatureTipShown(source: DorkaCliFeatureTipSource): void {
  track('dorka_cli_feature_tip_shown', { source })
}

export function trackDorkaCliFeatureTipSetupClicked(source: DorkaCliFeatureTipSource): void {
  track('dorka_cli_feature_tip_setup_clicked', { source })
}

export function trackDorkaCliFeatureTipSetupResult(
  source: DorkaCliFeatureTipSource,
  result: DorkaCliFeatureTipSetupResult
): void {
  track('dorka_cli_feature_tip_setup_result', { source, result })
}

export function trackCmdJPaletteFeatureTipShown(source: CmdJPaletteFeatureTipSource): void {
  track('cmd_j_palette_feature_tip_shown', { source })
}

export function trackCmdJPaletteFeatureTipAcknowledged(source: CmdJPaletteFeatureTipSource): void {
  track('cmd_j_palette_feature_tip_acknowledged', { source })
}
