import { test, expect } from './helpers/dorka-app'
import { getStoreState, waitForSessionReady } from './helpers/store'

test.describe('usage overview', () => {
  test.beforeEach(async ({ dorkaPage }) => {
    await waitForSessionReady(dorkaPage)
  })

  test('Stats & Usage opens on the combined overview with provider controls', async ({
    dorkaPage
  }) => {
    await dorkaPage.evaluate(() => {
      const state = window.__store!.getState()
      state.openSettingsPage()
    })

    await expect
      .poll(async () => getStoreState<string>(dorkaPage, 'activeView'), { timeout: 5_000 })
      .toBe('settings')
    await dorkaPage.getByRole('button', { name: 'Stats & Usage' }).click()
    await expect(dorkaPage.getByRole('heading', { name: 'Usage Analytics' })).toBeVisible()
    const providerDropdown = dorkaPage.getByTestId('usage-provider-select')
    await expect(providerDropdown).toHaveAttribute(
      'aria-label',
      'Usage analytics provider: Overview'
    )
    await expect(dorkaPage.getByTestId('usage-overview-pane')).toBeVisible()
    await expect(dorkaPage.getByRole('heading', { name: 'Usage Overview' })).toBeVisible()
    await expect(dorkaPage.getByRole('heading', { name: 'Providers' })).toBeVisible()
    await expect(dorkaPage.getByRole('button', { name: 'Enable Claude' })).toBeVisible()
    await expect(dorkaPage.getByRole('button', { name: 'Enable Codex' })).toBeVisible()
    await expect(dorkaPage.getByRole('button', { name: 'Enable OpenCode' })).toBeVisible()

    await providerDropdown.click()
    await dorkaPage.getByRole('menuitem', { name: 'Codex', exact: true }).click()
    await expect(dorkaPage.getByRole('heading', { name: 'Codex Usage Tracking' })).toBeVisible()
    await expect(providerDropdown).toHaveAttribute('aria-label', 'Usage analytics provider: Codex')

    await providerDropdown.click()
    await dorkaPage.getByRole('menuitem', { name: 'OpenCode', exact: true }).click()
    await expect(dorkaPage.getByRole('heading', { name: 'OpenCode Usage Tracking' })).toBeVisible()
    await expect(providerDropdown).toHaveAttribute(
      'aria-label',
      'Usage analytics provider: OpenCode'
    )
  })
})
