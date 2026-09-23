/**
 * End-to-end coverage for the Automations runs surface.
 *
 * The test intentionally does not depend on seeded run history: a fresh E2E
 * profile may have no automations, but the Runs navigation and empty state must
 * still be usable.
 */

import { test, expect } from './helpers/dorka-app'
import { waitForSessionReady } from './helpers/store'

test('opens the runs dashboard and returns to automations', async ({ dorkaPage }) => {
  await waitForSessionReady(dorkaPage)

  await dorkaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    store.getState().openAutomationsPage()
  })

  const runsButton = dorkaPage.getByRole('button', { name: 'Runs' })
  await expect(runsButton).toBeVisible()
  await runsButton.click()

  await expect(dorkaPage.getByRole('navigation', { name: 'Automations breadcrumb' })).toBeVisible()
  await expect(dorkaPage.getByText('Successful · 24h')).toBeVisible()
  await expect(dorkaPage.getByText('Failed · 24h')).toBeVisible()
  await expect(dorkaPage.getByText('Successful · 7d')).toBeVisible()
  await expect(dorkaPage.getByText('Failed · 7d')).toBeVisible()
  await expect(dorkaPage.getByRole('button', { name: 'Filters' })).toBeVisible()
  await expect(dorkaPage.getByRole('button', { name: 'Refresh runs' })).toBeVisible()
  await expect(dorkaPage.getByText('Automation', { exact: true })).toBeVisible()
  await expect(dorkaPage.getByText('Triggered', { exact: true })).toBeVisible()
  await expect(dorkaPage.getByText('Status', { exact: true })).toBeVisible()

  await dorkaPage
    .getByRole('navigation', { name: 'Automations breadcrumb' })
    .getByRole('button', { name: 'Automations' })
    .click()
  await expect(dorkaPage.getByRole('heading', { name: 'Automations' })).toBeVisible()
  await expect(runsButton).toBeVisible()
})
