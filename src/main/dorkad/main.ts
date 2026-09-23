/** Executable entry for `dorkad`. See `./dorkad-entry.ts`. */
import process from 'node:process'
import { main, resolveDorkadExitCode } from './dorkad-entry'
import { runDorkadNativePreflight } from './dorkad-native-preflight'

// Why exit before the preflight: reaching this line means the whole module graph resolved
// under plain Node, which is all the build guard needs to prove. Probing natives or
// starting a server to prove it would bind a port and take a data-root lock on a build
// machine.
if (process.argv.includes('--dorkad-smoke-load-check')) {
  process.exit(0)
}

// Why here and not inside startDorkad: this must run before anything requires node-pty,
// and `dorkad-entry` reaches it through `await import('../ipc/pty')`. Static imports are
// evaluated before this statement, so the guarantee is that no module in the graph
// requires node-pty at import time — which the bundle's lazy `require("node-pty")` in
// local-pty-provider satisfies. See ./node-pty-precondition.ts for why a child process.
runDorkadNativePreflight()

main().catch((error: unknown) => {
  console.error('dorkad: failed to start:', error)
  // Why a resolved code and not a bare 1: a data-root or bind-address refusal is a
  // configuration fault that restarting cannot fix, and a supervisor needs to tell the two
  // apart to avoid restart-spinning on it.
  process.exit(resolveDorkadExitCode(error))
})
