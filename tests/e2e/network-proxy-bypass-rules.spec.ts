import { test, expect } from './helpers/dorka-app'
import { waitForSessionReady } from './helpers/store'

test.describe('network proxy bypass rules', () => {
  test('preserves newline-separated hosts and canonicalizes them on blur', async ({
    dorkaPage
  }) => {
    await waitForSessionReady(dorkaPage)

    const original = await dorkaPage.evaluate(() => window.api.settings.get())
    try {
      await dorkaPage.evaluate(() => {
        const state = window.__store?.getState()
        state?.openSettingsTarget({ pane: 'advanced', repoId: null })
        state?.openSettingsPage()
      })

      await expect(dorkaPage.getByRole('heading', { name: 'Advanced', exact: true })).toBeVisible()
      await dorkaPage.getByRole('button', { name: 'Configure proxy' }).click()
      const bypassRules = dorkaPage.locator('#settings-http-proxy-bypass-rules')
      await expect(bypassRules).toBeVisible()
      await expect(bypassRules).toHaveJSProperty('tagName', 'TEXTAREA')

      await bypassRules.fill('localhost\n127.0.0.1\n*.internal.corp')
      await expect(bypassRules).toHaveValue('localhost\n127.0.0.1\n*.internal.corp')
      await dorkaPage.locator('#settings-http-proxy-url').focus()

      await expect
        .poll(
          async () =>
            (await dorkaPage.evaluate(() => window.api.settings.get())).httpProxyBypassRules
        )
        .toBe('localhost;127.0.0.1;*.internal.corp')
      await expect(bypassRules).toHaveValue('localhost;127.0.0.1;*.internal.corp')
    } finally {
      await dorkaPage.evaluate(
        (settings) =>
          window.api.settings.set({ httpProxyBypassRules: settings.httpProxyBypassRules ?? '' }),
        original
      )
    }
  })
})
