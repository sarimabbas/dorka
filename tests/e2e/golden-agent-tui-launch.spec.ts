import { expect, test } from './helpers/dorka-app'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  launchGoldenStubAgentFromNewTab
} from './helpers/golden-stub-agent'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { focusActiveTerminalInput, getTerminalContent } from './helpers/terminal'

test.use({ launchEnv: getGoldenStubAgentLaunchEnv() })

test('launches an agent TUI with a live multiline composer', async ({ dorkaPage }) => {
  await waitForSessionReady(dorkaPage)
  await waitForActiveWorktree(dorkaPage)
  await ensureTerminalVisible(dorkaPage)
  await configureGoldenStubAgent(dorkaPage)
  await launchGoldenStubAgentFromNewTab(dorkaPage)

  const activeTab = dorkaPage.locator('[data-testid="sortable-tab"][data-active="true"]')
  await expect(activeTab).toHaveAttribute('data-tab-title', /Codex|Golden Stub Agent/i)

  await focusActiveTerminalInput(dorkaPage)
  await dorkaPage.keyboard.type('hello from e2e')
  await dorkaPage.keyboard.press('Shift+Enter')
  await dorkaPage.keyboard.type('second line')

  await expect
    .poll(() => getTerminalContent(dorkaPage), { timeout: 10_000 })
    .toContain('> hello from e2e\r\n  second line')
  expect(await getTerminalContent(dorkaPage)).not.toContain('GOLDEN_STUB_AGENT_SUBMITTED')
})
