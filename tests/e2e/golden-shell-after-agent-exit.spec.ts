import { expect, test } from './helpers/dorka-app'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  GOLDEN_STUB_EXIT_MARKER,
  launchGoldenStubAgentFromNewTab
} from './helpers/golden-stub-agent'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForRestoredTerminalInputReady } from './helpers/restored-terminal-input-readiness'
import {
  focusActiveTerminalInput,
  waitForActivePanePtyId,
  waitForTerminalOutput
} from './helpers/terminal'

test.use({ launchEnv: getGoldenStubAgentLaunchEnv() })

// Why: xterm renders the typed command itself, so `echo after-agent` would
// satisfy waitForTerminalOutput even if the shell never ran it. Splitting the
// marker keeps it out of the input, so a match proves real shell execution.
function buildSplitMarkerEcho(prefix: string, suffix: string): { command: string; marker: string } {
  const command =
    process.platform === 'win32'
      ? `Write-Output ('${prefix}' + '${suffix}')`
      : `echo "${prefix}""${suffix}"`
  return { command, marker: `${prefix}${suffix}` }
}

test('opens a clean live shell after an agent exits', async ({ dorkaPage }) => {
  await waitForSessionReady(dorkaPage)
  await waitForActiveWorktree(dorkaPage)
  await ensureTerminalVisible(dorkaPage)
  await configureGoldenStubAgent(dorkaPage)
  await launchGoldenStubAgentFromNewTab(dorkaPage)

  await dorkaPage.keyboard.type('exit')
  await dorkaPage.keyboard.press('Enter')
  await waitForTerminalOutput(dorkaPage, GOLDEN_STUB_EXIT_MARKER, 15_000)

  const tabsBeforeShell = await dorkaPage.locator('[data-testid="sortable-tab"]').count()
  await dorkaPage.getByRole('button', { name: 'New tab' }).click({ force: true })
  await dorkaPage
    .getByRole('menuitem', { name: /New Terminal/i })
    .first()
    .click({ force: true })
  await expect(dorkaPage.locator('[data-testid="sortable-tab"]')).toHaveCount(tabsBeforeShell + 1)
  const shellPtyId = await waitForActivePanePtyId(dorkaPage)
  // Why: a bound ptyId only means the pane exists; the renderer transport can
  // still drop keystrokes until it connects, which would strand the markers.
  expect(await waitForRestoredTerminalInputReady(dorkaPage, shellPtyId)).toBe(true)

  const afterAgent = buildSplitMarkerEcho('after-', 'agent')
  await focusActiveTerminalInput(dorkaPage)
  await dorkaPage.keyboard.type(afterAgent.command)
  await dorkaPage.keyboard.press('Enter')
  await waitForTerminalOutput(dorkaPage, afterAgent.marker, 15_000)

  const afterShiftEnter = buildSplitMarkerEcho('after-shift-', 'enter')
  await dorkaPage.keyboard.press('Shift+Enter')
  await dorkaPage.keyboard.type(afterShiftEnter.command)
  await dorkaPage.keyboard.press('Enter')
  await waitForTerminalOutput(dorkaPage, afterShiftEnter.marker, 15_000)
  await expect(dorkaPage.locator('[data-testid="sortable-tab"]')).toHaveCount(tabsBeforeShell + 1)
})
