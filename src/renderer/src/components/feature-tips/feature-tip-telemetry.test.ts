import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/telemetry', () => ({
  track: trackMock
}))

import {
  getDorkaCliFeatureTipTelemetrySource,
  trackCmdJPaletteFeatureTipAcknowledged,
  trackCmdJPaletteFeatureTipShown,
  trackDorkaCliFeatureTipSetupClicked,
  trackDorkaCliFeatureTipSetupResult,
  trackDorkaCliFeatureTipShown
} from './feature-tip-telemetry'

describe('feature tip telemetry', () => {
  beforeEach(() => {
    trackMock.mockClear()
  })

  it('keeps feature tip sources low-cardinality', () => {
    expect(getDorkaCliFeatureTipTelemetrySource('app_open')).toBe('app_open')
    expect(getDorkaCliFeatureTipTelemetrySource('settings')).toBe('manual')
    expect(getDorkaCliFeatureTipTelemetrySource(undefined)).toBe('manual')
  })

  it('tracks CLI tip exposure once per explicit call', () => {
    trackDorkaCliFeatureTipShown('app_open')

    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('dorka_cli_feature_tip_shown', {
      source: 'app_open'
    })
  })

  it('tracks command palette tip exposure and acknowledgement', () => {
    trackCmdJPaletteFeatureTipShown('app_open')
    trackCmdJPaletteFeatureTipAcknowledged('manual')

    expect(trackMock).toHaveBeenCalledTimes(2)
    expect(trackMock).toHaveBeenNthCalledWith(1, 'cmd_j_palette_feature_tip_shown', {
      source: 'app_open'
    })
    expect(trackMock).toHaveBeenNthCalledWith(2, 'cmd_j_palette_feature_tip_acknowledged', {
      source: 'manual'
    })
  })

  it('tracks setup click and result without raw CLI details', () => {
    trackDorkaCliFeatureTipSetupClicked('app_open')
    trackDorkaCliFeatureTipSetupResult('app_open', 'installed')

    expect(trackMock).toHaveBeenCalledTimes(2)
    expect(trackMock).toHaveBeenNthCalledWith(1, 'dorka_cli_feature_tip_setup_clicked', {
      source: 'app_open'
    })
    expect(trackMock).toHaveBeenNthCalledWith(2, 'dorka_cli_feature_tip_setup_result', {
      source: 'app_open',
      result: 'installed'
    })
  })
})
