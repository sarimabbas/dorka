import { writeFile } from 'node:fs/promises'
import { buildShellCommandFromArgv } from '../../src/shared/tui-agent-startup-shell'
import { test, expect } from './helpers/dorka-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test('OMP spaced-colon title renders working and clears on idle', async ({
  dorkaPage
}, testInfo) => {
  test.skip(
    process.platform === 'win32',
    'POSIX title replay; Windows formatter bytes have separate coverage'
  )
  await waitForSessionReady(dorkaPage)
  await waitForActiveWorktree(dorkaPage)
  await ensureTerminalVisible(dorkaPage)
  await waitForActiveTerminalManager(dorkaPage)
  const ptyId = await waitForActivePanePtyId(dorkaPage)
  const script = testInfo.outputPath('title-replay.cjs')
  await writeFile(
    script,
    `
process.stdout.write('\\x1b]0;OMP : Image review\\x07')
process.stdin.on('data', () => process.stdout.write('\\x1b]0;OMP > Image review\\x07'))
`
  )
  await execInTerminal(
    dorkaPage,
    ptyId,
    buildShellCommandFromArgv([process.execPath, script], 'posix')
  )
  const working = dorkaPage.locator('[aria-label="Working"]')
  await expect(working.first()).toBeVisible({ timeout: 15000 })
  await dorkaPage.screenshot({ path: testInfo.outputPath('omp-title-working.png') })
  await sendToTerminal(dorkaPage, ptyId, '\r')
  await expect(working).toHaveCount(0)
  await dorkaPage.screenshot({ path: testInfo.outputPath('omp-title-idle.png') })
})
