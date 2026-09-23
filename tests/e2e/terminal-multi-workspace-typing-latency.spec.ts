/**
 * Deterministic reproduction + benchmark for "typing lags while multiple
 * workspaces run agents" (the multi-workspace typing-latency complaint).
 *
 * Unlike the artificial-opencode suite (bounded bursts + held ACK gates),
 * this harness runs SUSTAINED paced agent-TUI streams through real PTYs in
 * background-workspace panes (and optionally visible splits) with no
 * artificial wedges, types at a fixed cadence WITHOUT waiting for each echo
 * (real users keep typing), and decomposes every key's latency into:
 *   input-half  = CDP keydown -> byte arrives at the pty (probe sidecar)
 *   echo-half   = pty echo    -> marker visible in the xterm buffer
 * All three clocks are epoch ms on one machine, so the halves add up.
 *
 * Scenarios are gated behind DORKA_TYPING_BENCH=1 (they are benchmarks that
 * may legitimately "fail" while the bug reproduces, not CI regression gates).
 * Set DORKA_TYPING_BENCH_INSTRUMENTATION=0 for a probe-off observer control.
 * Entry point: pnpm bench:multi-workspace-typing  (see
 * config/scripts/run-multi-workspace-typing-bench.mjs for knobs). Results are
 * written as JSON to tests/tools/benchmarks/results/ for A/B comparison.
 */
import type { Page, TestInfo } from '@stablyai/playwright-test'
import { type ChildProcess, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect } from './helpers/dorka-app'
import { createTypingLoadWorkspaces, removeTypingLoadWorkspaces } from './typing-load-workspaces'
import { readTypingScaleCensus } from './typing-scale-census'
import { withTypingRendererCpuProfile } from './typing-renderer-cpu-profile'
import {
  measurePacedTyping,
  type LatencyStats,
  type PacedTypingMeasurement
} from './paced-terminal-typing'
import {
  ensureTerminalVisible,
  getActiveWorktreeId,
  getAllWorktreeIds,
  switchToWorktree,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import {
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'
import {
  ensureActiveWorktreePaneLoad,
  focusPane,
  waitForTerminalOutputForPtyId,
  type TerminalLoadPane
} from './artificial-opencode-pane-interactions'
import {
  sustainedLoadReadyFilePath,
  typingProbeReadyMarker,
  writeSustainedAgentLoadScript,
  writeTypingEchoProbeScript
} from './sustained-agent-typing-load-scripts'
import {
  cleanupAccumulatedWorkspaceFixture,
  seedAccumulatedWorkspaceFixture,
  startAccumulatedBenchmarkInstrumentation,
  stopAccumulatedBenchmarkInstrumentation
} from './accumulated-workspace-fixture'
import {
  startAccumulatedStatusTraffic,
  stopAccumulatedStatusTraffic,
  validateAccumulatedStatusIpcIngress,
  type AccumulatedStatusIngressValidation,
  type AccumulatedStatusTrafficStats
} from './accumulated-workspace-status-fixture'
import {
  startAccumulatedTitleTraffic,
  stopAccumulatedTitleTraffic
} from './accumulated-workspace-title-fixture'
import {
  injectRendererLongTaskSelfTest,
  startRuntimeGraphPublicationProbe,
  stopRuntimeGraphPublicationProbe,
  type RendererLongTaskSelfTestWindow,
  type RuntimeGraphPublicationProbeSnapshot
} from './runtime-graph-publication-probe'

const BENCH_ENABLED = process.env.DORKA_TYPING_BENCH === '1'

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

const LOAD_WORKSPACES = readPositiveInt('DORKA_TYPING_BENCH_LOAD_WORKSPACES', 1)
const LOAD_PANES = readPositiveInt('DORKA_TYPING_BENCH_LOAD_PANES', 4)
const LOAD_RATE_KBPS = readPositiveInt('DORKA_TYPING_BENCH_RATE_KBPS', 256)
const KEY_COUNT = readPositiveInt('DORKA_TYPING_BENCH_KEYS', 32)
const KEY_CADENCE_MS = readPositiveInt('DORKA_TYPING_BENCH_KEY_CADENCE_MS', 250)
const CPU_WORKERS = readPositiveInt('DORKA_TYPING_BENCH_CPU_WORKERS', 0)
const PTY_METADATA = process.env.DORKA_TYPING_BENCH_PTY_METADATA === '1'
const BENCH_LABEL = process.env.DORKA_TYPING_BENCH_LABEL ?? 'dev'
// Request optional probes by default; the report records when the build does not install them.
const BENCH_INSTRUMENTATION_REQUESTED = process.env.DORKA_TYPING_BENCH_INSTRUMENTATION !== '0'
// Diagnostic only: patching main's invoke handler is observer overhead, so keep it out of acceptance runs.
const GRAPH_PROBE_REQUESTED = process.env.DORKA_TYPING_BENCH_GRAPH_PROBE === '1'
const GRAPH_PROBE_SELF_TEST_MS = readPositiveInt('DORKA_TYPING_BENCH_GRAPH_PROBE_SELFTEST_MS', 0)
// Estimates a slower single core. Applied only around the typing window: throttling setup would
// change what the fixture manages to build, not just how fast the measured window runs.
const CPU_THROTTLE_RATE = readPositiveInt('DORKA_TYPING_BENCH_CPU_THROTTLE', 1)

// Load must outlive setup (pane splits, worktree switches) plus the typing
// window; generously padded because setup time varies with pane count.
const LOAD_DURATION_S = Math.ceil((KEY_COUNT * KEY_CADENCE_MS) / 1000) + 90

const RESULTS_DIR = path.resolve(__dirname, '..', 'tools', 'benchmarks', 'results')

type SchedulerDebugSnapshot = {
  queuedChars: number
  peakQueuedChars: number
  droppedBacklogCount: number
}

type MainDeliveryDebugSnapshot = {
  pendingChars: number
  peakPendingChars: number
  peakRendererInFlightChars: number
  hiddenDeliveryGatedPtyCount: number
  hiddenDeliveryDroppedChars: number
  pendingDroppedChars: number
}

type TypingBenchWindow = Window & {
  __terminalOutputSchedulerDebug?: {
    reset: () => void
    snapshot: () => SchedulerDebugSnapshot
  }
}

async function readSchedulerDebug(page: Page): Promise<SchedulerDebugSnapshot | null> {
  return page.evaluate(
    () => (window as TypingBenchWindow).__terminalOutputSchedulerDebug?.snapshot() ?? null
  )
}

async function readMainDeliveryDebug(page: Page): Promise<MainDeliveryDebugSnapshot | null> {
  return page.evaluate(async () => window.api.pty.getRendererDeliveryDebugSnapshot())
}

async function resetDeliveryDebug(page: Page): Promise<void> {
  await page.evaluate(async () => {
    ;(window as TypingBenchWindow).__terminalOutputSchedulerDebug?.reset()
    await window.api.pty.resetRendererDeliveryDebug()
  })
}

function spawnCpuPressureWorkers(): ChildProcess[] {
  const workerPath = path.resolve(__dirname, '..', 'tools', 'benchmarks', 'cpu-pressure-worker.mjs')
  return Array.from({ length: CPU_WORKERS }, () =>
    spawn(process.execPath, [workerPath, String((LOAD_DURATION_S + 120) * 1000)], {
      stdio: 'ignore'
    })
  )
}

/** Rate 1 is a no-op, so an unthrottled run opens no CDP session at all. */
async function withRendererCpuThrottle<T>(
  page: Page,
  rate: number,
  run: () => Promise<T>
): Promise<{ result: T; appliedRate: number }> {
  if (rate <= 1) {
    return { result: await run(), appliedRate: 1 }
  }
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Emulation.setCPUThrottlingRate', { rate })
    return { result: await run(), appliedRate: rate }
  } finally {
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {})
    await session.detach().catch(() => {})
  }
}

/** Carries the conditions the window ran under, so the report cannot invent them. */
type TypingWindowMeasurement = {
  measurement: PacedTypingMeasurement
  appliedCpuThrottleRate: number
}

/**
 * The only way to obtain a measurement writeBenchReport will accept: a scenario
 * that skips the throttle cannot then report one.
 */
async function measureTypingWindow(
  page: Page,
  runId: string,
  sidecarPath: string
): Promise<TypingWindowMeasurement> {
  const { result, appliedRate } = await withRendererCpuThrottle(page, CPU_THROTTLE_RATE, () =>
    withTypingRendererCpuProfile(page, process.env.DORKA_TYPING_BENCH_CPU_PROFILE, () =>
      measurePacedTyping(page, runId, sidecarPath, {
        keyCount: KEY_COUNT,
        keyCadenceMs: KEY_CADENCE_MS
      })
    )
  )
  return { measurement: result, appliedCpuThrottleRate: appliedRate }
}

function writeBenchReport(
  testInfo: TestInfo,
  scenario: string,
  measured: TypingWindowMeasurement,
  scheduler: SchedulerDebugSnapshot | null,
  mainDelivery: MainDeliveryDebugSnapshot | null,
  instrumentation?: unknown,
  titleWorkload?: { registeredTabs: number; registeredPanes: number } | null,
  statusWorkload?: AccumulatedStatusTrafficStats | null,
  statusIngressValidation?: AccumulatedStatusIngressValidation | null,
  scaleCensus?: unknown,
  accumulatedFixture?: unknown,
  ptyWorkload?: unknown,
  graphProbe?: RuntimeGraphPublicationProbeSnapshot | null
): void {
  const { measurement, appliedCpuThrottleRate } = measured
  const report = {
    benchmark: 'multi-workspace-typing-latency',
    label: BENCH_LABEL,
    scenario,
    timestamp: new Date().toISOString(),
    buildArtifacts: {
      mainSha256: createHash('sha256').update(readFileSync('out/main/index.js')).digest('hex'),
      rendererAssetNamesSha256: createHash('sha256')
        .update(readdirSync('out/renderer/assets').sort().join('\n'))
        .digest('hex')
    },
    config: {
      loadPanes: LOAD_PANES,
      loadWorkspaces: LOAD_WORKSPACES,
      visitedWorkspaces: readPositiveInt('DORKA_TYPING_BENCH_VISITED_WORKSPACES', LOAD_WORKSPACES),
      loadRateKbps: LOAD_RATE_KBPS,
      streamPacing: 'utf8-bytes-per-tick',
      keyCount: KEY_COUNT,
      keyCadenceMs: KEY_CADENCE_MS,
      cpuWorkers: CPU_WORKERS,
      ptyMetadata: PTY_METADATA,
      cpuProfile: process.env.DORKA_TYPING_BENCH_CPU_PROFILE ?? null,
      titleChangeMs: readPositiveInt('DORKA_TYPING_BENCH_TITLE_CHANGE_MS', 0),
      lifecycleMs: readPositiveInt('DORKA_TYPING_BENCH_LIFECYCLE_MS', 0),
      agentRows: process.env.DORKA_TYPING_BENCH_AGENT_ROWS ?? 'default',
      metadataWorktrees: readPositiveInt('DORKA_TYPING_BENCH_METADATA_WORKTREES', 870),
      metadataRepositories: readPositiveInt('DORKA_TYPING_BENCH_METADATA_REPOSITORIES', 27),
      metadataTerminalTabs: readPositiveInt('DORKA_TYPING_BENCH_METADATA_TERMINAL_TABS', 1410),
      metadataUnifiedTabs: readPositiveInt('DORKA_TYPING_BENCH_METADATA_UNIFIED_TABS', 2000),
      metadataPanesPerTab: readPositiveInt('DORKA_TYPING_BENCH_METADATA_PANES', 1),
      metadataSleepingRecords: readPositiveInt('DORKA_TYPING_BENCH_METADATA_SLEEPERS', 857),
      metadataLiveStatuses: readPositiveInt('DORKA_TYPING_BENCH_METADATA_LIVE_STATUSES', 177),
      metadataStatusHistory: readPositiveInt('DORKA_TYPING_BENCH_METADATA_STATUS_HISTORY', 3),
      metadataStatusIntervalMs: readPositiveInt(
        'DORKA_TYPING_BENCH_METADATA_STATUS_INTERVAL_MS',
        100
      ),
      instrumentationRequested: BENCH_INSTRUMENTATION_REQUESTED,
      graphProbeRequested: GRAPH_PROBE_REQUESTED,
      // What this scenario actually ran under, not what the flag requested.
      cpuThrottleRate: appliedCpuThrottleRate,
      statusTrafficModel: PTY_METADATA
        ? 'pty-osc-through-runtime-and-ipc-bridge'
        : 'electron-ipc-burst-through-production-bridge'
    },
    measurement,
    scheduler,
    mainDelivery,
    instrumentation,
    titleWorkload: titleWorkload ?? null,
    statusWorkload: statusWorkload ?? null,
    statusIngressValidation: statusIngressValidation ?? null,
    scaleCensus: scaleCensus ?? null,
    accumulatedFixture: accumulatedFixture ?? null,
    ptyWorkload: ptyWorkload ?? null,
    graphProbe: graphProbe ?? null
  }
  mkdirSync(RESULTS_DIR, { recursive: true })
  const stamp = report.timestamp.replace(/[:.]/g, '-')
  const outPath = path.join(
    RESULTS_DIR,
    `multi-workspace-typing-${BENCH_LABEL}-${scenario}-${stamp}.json`
  )
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  const fmt = (stats: LatencyStats | null): string =>
    stats
      ? `p50 ${stats.p50.toFixed(1)}ms p90 ${stats.p90.toFixed(1)}ms max ${stats.max.toFixed(1)}ms`
      : 'n/a'
  testInfo.annotations.push({
    type: `multi-workspace-typing-${scenario}`,
    description:
      `planned-to-buffer ${fmt(measurement.plannedToBufferEchoMs)} | dispatch-delay ${fmt(measurement.dispatchDelayMs)} | ` +
      `total ${fmt(measurement.totalMs)} | input-half ${fmt(measurement.inputHalfMs)} | ` +
      `echo-half ${fmt(measurement.echoHalfMs)} | drift ${measurement.maxTimerDriftMs.toFixed(1)}ms | ` +
      `keys ${measurement.keyCount} validated | report ${outPath}`
  })
  console.log(`[multi-workspace-typing] ${scenario}: ${testInfo.annotations.at(-1)?.description}`)
}

async function startSustainedLoadInPanes(
  page: Page,
  panes: TerminalLoadPane[],
  scriptPath: string,
  runId: string,
  readyFileDirectory: string
): Promise<void> {
  for (const [index, pane] of panes.entries()) {
    await sendToTerminal(
      page,
      pane.ptyId,
      `node ${JSON.stringify(scriptPath)} ${index} ${LOAD_RATE_KBPS} ${LOAD_DURATION_S} ${PTY_METADATA ? 1 : 0} ${readPositiveInt('DORKA_TYPING_BENCH_TITLE_CHANGE_MS', 0)} ${readPositiveInt('DORKA_TYPING_BENCH_LIFECYCLE_MS', 0)}\r`
    )
  }
  // Readiness is signalled via files, not terminal markers: a streaming pane
  // scrolls its READY line out of the buffer before sequential checks get to
  // it once several panes start together.
  const missingReadyPanes = (): number[] =>
    panes
      .map((_, index) => index)
      .filter((index) => !existsSync(sustainedLoadReadyFilePath(readyFileDirectory, runId, index)))
  await expect
    .poll(() => missingReadyPanes().length, {
      timeout: 30_000,
      message: `load panes never signalled ready: ${missingReadyPanes().join(', ')}`
    })
    .toBe(0)
}

async function startTypingProbe(
  page: Page,
  typingPtyId: string,
  scriptPath: string,
  runId: string
): Promise<void> {
  await sendToTerminal(page, typingPtyId, `node ${JSON.stringify(scriptPath)}\r`)
  await waitForTerminalOutputForPtyId(page, typingPtyId, typingProbeReadyMarker(runId), 15_000)
}

function removeLoadReadyFiles(directory: string, runId: string, paneCount: number): void {
  for (let index = 0; index < paneCount; index++) {
    rmSync(sustainedLoadReadyFilePath(directory, runId, index), { force: true })
    rmSync(path.join(directory, `.dorka-mwt-load-stats-${runId}-${index}`), { force: true })
  }
}

async function stopPtysQuietly(page: Page, ptyIds: string[]): Promise<void> {
  await Promise.all(
    ptyIds.map((ptyId) => sendToTerminal(page, ptyId, '\x03').catch(() => undefined))
  )
}

test.describe('Multi-workspace sustained typing latency bench', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(10 * 60 * 1000)
  // Group scope, not the test bodies: a body-level skip still builds the Electron fixtures.
  test.skip(!BENCH_ENABLED, 'Bench-only: run via pnpm bench:multi-workspace-typing')

  test('baseline: paced typing with no agent load', async ({
    dorkaPage,
    testRepoPath
  }, testInfo) => {
    await waitForSessionReady(dorkaPage)
    await waitForActiveWorktree(dorkaPage)
    await ensureTerminalVisible(dorkaPage)
    await waitForActiveTerminalManager(dorkaPage, 30_000)
    const typingPtyId = await waitForActivePanePtyId(dorkaPage)

    const runId = randomUUID()
    const probePath = path.join(testRepoPath, `.dorka-mwt-probe-${runId}.mjs`)
    const sidecarPath = path.join(testRepoPath, `.dorka-mwt-arrivals-${runId}.jsonl`)
    writeTypingEchoProbeScript(probePath, runId, sidecarPath)
    try {
      await resetDeliveryDebug(dorkaPage)
      await startTypingProbe(dorkaPage, typingPtyId, probePath, runId)
      const measured = await measureTypingWindow(dorkaPage, runId, sidecarPath)
      const { measurement } = measured
      writeBenchReport(
        testInfo,
        'baseline',
        measured,
        await readSchedulerDebug(dorkaPage),
        await readMainDeliveryDebug(dorkaPage)
      )
      expect(measurement.inputHalfMs?.count).toBe(KEY_COUNT)
      expect(measurement.totalMs?.count).toBe(KEY_COUNT)
      expect(measurement.totalMs?.p50 ?? Number.POSITIVE_INFINITY).toBeLessThan(250)
    } finally {
      await stopPtysQuietly(dorkaPage, [typingPtyId])
      rmSync(probePath, { force: true })
      rmSync(sidecarPath, { force: true })
    }
  })

  test('typing under sustained hidden multi-workspace agent load', async ({
    electronApp,
    dorkaPage
  }, testInfo) => {
    await waitForSessionReady(dorkaPage)
    const typingWorktreeId = await waitForActiveWorktree(dorkaPage)
    const loadWorktreeId = (await getAllWorktreeIds(dorkaPage)).find((id) => id !== typingWorktreeId)
    expect(Boolean(loadWorktreeId), 'bench needs the seeded secondary worktree').toBe(true)
    if (!loadWorktreeId) {
      return
    }

    const scratch = mkdtempSync(path.join(tmpdir(), 'dorka-typing-load-'))
    const runId = randomUUID()
    const loadPath = path.join(scratch, `.dorka-mwt-load-${runId}.mjs`)
    const probePath = path.join(scratch, `.dorka-mwt-probe-${runId}.mjs`)
    const sidecarPath = path.join(scratch, `.dorka-mwt-arrivals-${runId}.jsonl`)
    writeSustainedAgentLoadScript(loadPath, runId, scratch)
    writeTypingEchoProbeScript(probePath, runId, sidecarPath)

    const cpuWorkers = spawnCpuPressureWorkers()
    let loadPanes: TerminalLoadPane[] = []
    const createdWorktreeIds: string[] = []
    let titleWorkload: { registeredTabs: number; registeredPanes: number } | null = null
    let statusTrafficStarted = false
    let instrumentationAvailable = false
    let graphProbeStart: { main: string; renderer: string } | null = null
    let graphProbeSelfTest: RendererLongTaskSelfTestWindow | null = null
    let statusIngressValidation: AccumulatedStatusIngressValidation | null = null
    try {
      await switchToWorktree(dorkaPage, loadWorktreeId)
      loadPanes = await createTypingLoadWorkspaces(
        dorkaPage,
        loadWorktreeId,
        LOAD_PANES,
        LOAD_WORKSPACES,
        readPositiveInt('DORKA_TYPING_BENCH_VISITED_WORKSPACES', LOAD_WORKSPACES),
        createdWorktreeIds
      )
      await startSustainedLoadInPanes(dorkaPage, loadPanes, loadPath, runId, scratch)

      await switchToWorktree(dorkaPage, typingWorktreeId)
      await expect
        .poll(() => getActiveWorktreeId(dorkaPage), { timeout: 10_000 })
        .toBe(typingWorktreeId)
      await ensureTerminalVisible(dorkaPage)
      await waitForActiveTerminalManager(dorkaPage, 30_000)
      const typingPtyId = await waitForActivePanePtyId(dorkaPage)

      const fixtureSummary = await seedAccumulatedWorkspaceFixture(dorkaPage, {
        worktrees: readPositiveInt('DORKA_TYPING_BENCH_METADATA_WORKTREES', 870),
        repositories: readPositiveInt('DORKA_TYPING_BENCH_METADATA_REPOSITORIES', 27),
        terminalTabs: readPositiveInt('DORKA_TYPING_BENCH_METADATA_TERMINAL_TABS', 1410),
        unifiedTabs: readPositiveInt('DORKA_TYPING_BENCH_METADATA_UNIFIED_TABS', 2000),
        panesPerTab: readPositiveInt('DORKA_TYPING_BENCH_METADATA_PANES', 1),
        sleepingRecords: readPositiveInt('DORKA_TYPING_BENCH_METADATA_SLEEPERS', 857),
        liveStatuses: readPositiveInt('DORKA_TYPING_BENCH_METADATA_LIVE_STATUSES', 177),
        statusHistoryEntries: readPositiveInt('DORKA_TYPING_BENCH_METADATA_STATUS_HISTORY', 3)
      })
      if (process.env.DORKA_TYPING_BENCH_AGENT_ROWS === 'full') {
        await dorkaPage.evaluate(() =>
          window.__store?.setState({
            worktreeCardProperties: ['status', 'inline-agents'],
            agentActivityDisplayMode: 'full'
          })
        )
      }
      console.log(`[multi-workspace-typing] accumulated fixture: ${JSON.stringify(fixtureSummary)}`)
      const statusTrafficEnabled =
        !PTY_METADATA && process.env.DORKA_TYPING_BENCH_METADATA_STATUS !== '0'
      if (statusTrafficEnabled) {
        statusIngressValidation = await validateAccumulatedStatusIpcIngress(electronApp, dorkaPage)
        const validationPaneCount = Math.min(3, fixtureSummary.liveStatuses)
        expect(statusIngressValidation).toEqual({
          burstEvents: validationPaneCount,
          staggeredEvents: validationPaneCount
        })
      }
      if (BENCH_INSTRUMENTATION_REQUESTED) {
        instrumentationAvailable = await startAccumulatedBenchmarkInstrumentation(dorkaPage)
      }
      if (GRAPH_PROBE_REQUESTED) {
        graphProbeStart = await startRuntimeGraphPublicationProbe(electronApp, dorkaPage)
        if (GRAPH_PROBE_SELF_TEST_MS > 0) {
          graphProbeSelfTest = await injectRendererLongTaskSelfTest(
            dorkaPage,
            GRAPH_PROBE_SELF_TEST_MS
          )
        }
        console.log(`[multi-workspace-typing] graph probe: ${JSON.stringify(graphProbeStart)}`)
      }
      if (statusTrafficEnabled) {
        const statusTraffic = await startAccumulatedStatusTraffic(
          electronApp,
          dorkaPage,
          readPositiveInt('DORKA_TYPING_BENCH_METADATA_STATUS_INTERVAL_MS', 100)
        )
        expect(statusTraffic.trackedStatuses).toBe(fixtureSummary.liveStatuses)
        statusTrafficStarted = true
      }
      if (!PTY_METADATA && process.env.DORKA_TYPING_BENCH_METADATA_TITLES === '1') {
        titleWorkload = await startAccumulatedTitleTraffic(dorkaPage, 100)
        console.log(
          `[multi-workspace-typing] registered title workload: ${JSON.stringify(titleWorkload)}`
        )
      }

      await resetDeliveryDebug(dorkaPage)
      // Load is flowing when the hidden-delivery gate starts dropping the
      // background worktree's bytes — the topology the complaint describes.
      await expect
        .poll(
          async () => (await readMainDeliveryDebug(dorkaPage))?.hiddenDeliveryDroppedChars ?? 0,
          { timeout: 30_000, message: 'hidden load never started flowing' }
        )
        .toBeGreaterThan(0)

      if (PTY_METADATA) {
        await expect
          .poll(
            () =>
              dorkaPage.evaluate(
                () =>
                  Object.values(window.__store?.getState().agentStatusByPaneKey ?? {}).filter(
                    (row) => row.prompt === 'Synthetic production-path typing workload'
                  ).length
              ),
            { timeout: 30_000 }
          )
          .toBe(LOAD_PANES)
      }
      await startTypingProbe(dorkaPage, typingPtyId, probePath, runId)
      const measured = await measureTypingWindow(dorkaPage, runId, sidecarPath)
      const { measurement } = measured
      const statusWorkload = statusTrafficStarted
        ? await stopAccumulatedStatusTraffic(electronApp, dorkaPage)
        : null
      statusTrafficStarted = false
      if (statusWorkload) {
        // Presence first: the equalities below are all satisfied by an all-zero
        // result, so a controller that never started would read as success.
        expect(statusWorkload.generatedUpdates).toBeGreaterThan(0)
        expect(statusWorkload.trackedStatuses).toBeGreaterThan(0)
        expect(statusWorkload.acceptedUpdates).toBe(statusWorkload.generatedUpdates)
        expect(statusWorkload.latestReceipts).toBe(statusWorkload.trackedStatuses)
      }
      const instrumentation = BENCH_INSTRUMENTATION_REQUESTED
        ? await stopAccumulatedBenchmarkInstrumentation(dorkaPage)
        : { available: false as const, reason: 'disabled' as const, snapshot: null }
      instrumentationAvailable = false
      const graphProbe = graphProbeStart
        ? await stopRuntimeGraphPublicationProbe(
            electronApp,
            dorkaPage,
            graphProbeStart,
            graphProbeSelfTest
          )
        : null
      graphProbeStart = null
      writeBenchReport(
        testInfo,
        `hidden-load-${LOAD_PANES}x${LOAD_RATE_KBPS}kbps-cpu${CPU_WORKERS}`,
        measured,
        await readSchedulerDebug(dorkaPage),
        await readMainDeliveryDebug(dorkaPage),
        instrumentation,
        titleWorkload,
        statusWorkload,
        statusIngressValidation,
        await readTypingScaleCensus(dorkaPage),
        fixtureSummary,
        {
          producers: loadPanes.map((_, index) =>
            JSON.parse(
              readFileSync(path.join(scratch, `.dorka-mwt-load-stats-${runId}-${index}`), 'utf8')
            )
          ),
          receipts: await dorkaPage.evaluate(() => {
            const state = window.__store?.getState()
            return {
              statuses: Object.values(state?.agentStatusByPaneKey ?? {})
                .filter((row) => row.prompt === 'Synthetic production-path typing workload')
                .map((row) => ({
                  sequence: row.acceptedStatusSeq,
                  providerSession: row.providerSession,
                  state: row.state,
                  message: row.lastAssistantMessage
                })),
              titles: Object.values(state?.runtimePaneTitlesByTabId ?? {}).flatMap(Object.values),
              agentRowsMode: state?.agentActivityDisplayMode,
              renderedAgentRows: document.querySelectorAll(
                '.worktree-agent-row-hover, .compact-agent-row'
              ).length
            }
          })
        },
        graphProbe
      )
      const screenDirectory = path.resolve('.tmp', 'typing-reproduction')
      mkdirSync(screenDirectory, { recursive: true })
      await dorkaPage.screenshot({ path: path.join(screenDirectory, `${BENCH_LABEL}-screen.png`) })
      // Hang detector only — the JSON report is the benchmark output. A
      // reproduced regression shows up as large percentiles, not a hard fail.
      expect(measurement.inputHalfMs?.count).toBe(KEY_COUNT)
      expect(measurement.totalMs?.count).toBe(KEY_COUNT)

      await stopPtysQuietly(dorkaPage, [typingPtyId])
    } finally {
      if (instrumentationAvailable) {
        await stopAccumulatedBenchmarkInstrumentation(dorkaPage).catch(() => undefined)
      }
      if (graphProbeStart) {
        await stopRuntimeGraphPublicationProbe(
          electronApp,
          dorkaPage,
          graphProbeStart,
          graphProbeSelfTest
        ).catch(() => undefined)
      }
      if (statusTrafficStarted) {
        await stopAccumulatedStatusTraffic(electronApp, dorkaPage)
      }
      await stopAccumulatedTitleTraffic(dorkaPage)
      await cleanupAccumulatedWorkspaceFixture(dorkaPage)
      for (const worker of cpuWorkers) {
        worker.kill('SIGKILL')
      }
      await switchToWorktree(dorkaPage, loadWorktreeId).catch(() => undefined)
      await stopPtysQuietly(
        dorkaPage,
        loadPanes.map((pane) => pane.ptyId)
      )
      await switchToWorktree(dorkaPage, typingWorktreeId).catch(() => undefined)
      rmSync(loadPath, { force: true })
      rmSync(probePath, { force: true })
      rmSync(sidecarPath, { force: true })
      removeLoadReadyFiles(scratch, runId, LOAD_PANES)
      await removeTypingLoadWorkspaces(dorkaPage, createdWorktreeIds)
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('typing under sustained visible split agent load', async ({
    dorkaPage,
    testRepoPath
  }, testInfo) => {
    await waitForSessionReady(dorkaPage)
    await waitForActiveWorktree(dorkaPage)
    await ensureTerminalVisible(dorkaPage)
    await waitForActiveTerminalManager(dorkaPage, 30_000)

    const runId = randomUUID()
    const loadPath = path.join(testRepoPath, `.dorka-mwt-load-${runId}.mjs`)
    const probePath = path.join(testRepoPath, `.dorka-mwt-probe-${runId}.mjs`)
    const sidecarPath = path.join(testRepoPath, `.dorka-mwt-arrivals-${runId}.jsonl`)
    writeSustainedAgentLoadScript(loadPath, runId, testRepoPath)
    writeTypingEchoProbeScript(probePath, runId, sidecarPath)

    const cpuWorkers = spawnCpuPressureWorkers()
    let panes: TerminalLoadPane[] = []
    try {
      // Pane 0 types; the rest replay the agent stream side by side — the
      // "Claude Code running in a visible split" shape.
      panes = await ensureActiveWorktreePaneLoad(dorkaPage, 2)
      const [typingPane, ...loadPanes] = panes
      await startSustainedLoadInPanes(dorkaPage, loadPanes, loadPath, runId, testRepoPath)
      await focusPane(dorkaPage, typingPane.paneKey)

      await resetDeliveryDebug(dorkaPage)
      await startTypingProbe(dorkaPage, typingPane.ptyId, probePath, runId)
      const measured = await measureTypingWindow(dorkaPage, runId, sidecarPath)
      const { measurement } = measured
      writeBenchReport(
        testInfo,
        `visible-split-${LOAD_RATE_KBPS}kbps-cpu${CPU_WORKERS}`,
        measured,
        await readSchedulerDebug(dorkaPage),
        await readMainDeliveryDebug(dorkaPage)
      )
      expect(measurement.inputHalfMs?.count).toBe(KEY_COUNT)
      expect(measurement.totalMs?.count).toBe(KEY_COUNT)
    } finally {
      for (const worker of cpuWorkers) {
        worker.kill('SIGKILL')
      }
      await stopPtysQuietly(
        dorkaPage,
        panes.map((pane) => pane.ptyId)
      )
      rmSync(loadPath, { force: true })
      rmSync(probePath, { force: true })
      rmSync(sidecarPath, { force: true })
      removeLoadReadyFiles(testRepoPath, runId, panes.length)
    }
  })
})
