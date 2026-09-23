import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import {
  findDorkaDispatchTaskMarkerIndex,
  DORKA_DISPATCH_STATUS_PREAMBLE_PREFIX,
  DORKA_DISPATCH_STATUS_TASK_MARKER
} from '../../../shared/dorka-dispatch-status-prompt'

export const DORKA_DISPATCH_PREAMBLE_PREFIX = DORKA_DISPATCH_STATUS_PREAMBLE_PREFIX
const DORKA_DISPATCH_TASK_MARKER = DORKA_DISPATCH_STATUS_TASK_MARKER
const DORKA_DISPATCH_TASK_ID_MARKER = 'Your task ID is:'
// Why: match deriveGeneratedTabTitle's scan budget — previews only need the
// first non-empty task line, not the rest of a paste-sized worker prompt.
const DORKA_DISPATCH_TASK_PREVIEW_SCAN_LIMIT = 512
// Why: task id lives near the top of the preamble; keep that scan tight.
const DORKA_DISPATCH_TASK_ID_SCAN_LIMIT = 1024
// Why: === TASK === sits after CLI instructions (a few KB). Cap the search so a
// malformed multi-MB prompt without a marker never full-scans the task body.
const DORKA_DISPATCH_TASK_MARKER_SCAN_LIMIT = 32_768

/** True when the live prompt is still an Dorka dispatch turn (not sticky metadata alone). */
export function isDorkaDispatchPrompt(prompt: string): boolean {
  return prompt.trimStart().startsWith(DORKA_DISPATCH_PREAMBLE_PREFIX)
}

/**
 * True when orchestration labels may label the live dispatch turn.
 * Reject only when both sides expose a taskId and they differ — sticky completed
 * metadata must not rename a later dispatch. When the live prompt is truncated
 * (agent-status fields are short) and has no parseable taskId, trust labels.
 */
export function orchestrationLabelsMatchLiveDispatch(
  entry: Pick<AgentStatusEntry, 'orchestration' | 'prompt'>
): boolean {
  if (!isDorkaDispatchPrompt(entry.prompt)) {
    return false
  }
  const orchestrationTaskId = entry.orchestration?.taskId?.trim()
  if (!orchestrationTaskId) {
    return false
  }
  const liveTaskId = getDorkaDispatchTaskId(entry.prompt)
  if (!liveTaskId) {
    return true
  }
  return liveTaskId === orchestrationTaskId
}

export function getAgentRowPrimaryText(
  entry: Pick<AgentStatusEntry, 'orchestration' | 'prompt'>
): string {
  // Why: prefer richer orchestration labels when they match the live dispatch,
  // then fall back to the TASK-body preview. Never surface the lifecycle
  // preamble itself — status prompts are single-line ~200-char folds, and the
  // first characters are boilerplate ("You are working inside Dorka…").
  if (orchestrationLabelsMatchLiveDispatch(entry)) {
    return (
      entry.orchestration?.displayName?.trim() ||
      entry.orchestration?.taskTitle?.trim() ||
      getDorkaDispatchTaskPreview(entry.prompt)
    )
  }
  if (isDorkaDispatchPrompt(entry.prompt)) {
    return getDorkaDispatchTaskPreview(entry.prompt)
  }
  return entry.prompt.trim()
}

export function getAgentRowGeneratedTitleText(
  entry: Pick<AgentStatusEntry, 'orchestration' | 'prompt'>
): string {
  // Why: only prefer orchestration/task labels while the live prompt is still
  // the same dispatch turn — sticky orchestration must not rename new work.
  if (isDorkaDispatchPrompt(entry.prompt)) {
    return getAgentRowPrimaryText(entry)
  }
  return entry.prompt
}

export function getDorkaDispatchTaskId(prompt: string): string | null {
  if (!isDorkaDispatchPrompt(prompt)) {
    return null
  }
  const scan = prompt.trimStart().slice(0, DORKA_DISPATCH_TASK_ID_SCAN_LIMIT)
  const markerIndex = scan.indexOf(DORKA_DISPATCH_TASK_ID_MARKER)
  if (markerIndex === -1) {
    return null
  }
  // Why: delimit on the first whitespace, not just a newline. The task id is a
  // whitespace-free token, and by the time this parses a live status prompt the
  // trailing newline has been folded to a space by normalizeSingleLinePreview —
  // splitting on \n alone would return the id plus the rest of the preamble.
  const afterMarker = scan.slice(markerIndex + DORKA_DISPATCH_TASK_ID_MARKER.length).trimStart()
  const idEnd = afterMarker.search(/\s/)
  const idLine = idEnd === -1 ? afterMarker : afterMarker.slice(0, idEnd)
  return idLine || null
}

function getDorkaDispatchTaskPreview(prompt: string): string {
  // Why: sidebar rows call this during render; never full-trim/split paste-sized
  // dispatch prompts — only scan bounded windows for the marker and first line.
  // Production status prompts are already folded to a single line (newlines →
  // spaces) and capped ~200 chars by normalizePromptField, which preserves
  // `=== TASK ===` + body. Prefer the first non-empty line so multi-line raw
  // preambles still work; a single-line fold is one "line" after the marker.
  if (!isDorkaDispatchPrompt(prompt)) {
    return ''
  }
  const scan = prompt
    .trimStart()
    .slice(0, DORKA_DISPATCH_TASK_MARKER_SCAN_LIMIT + DORKA_DISPATCH_TASK_PREVIEW_SCAN_LIMIT)
  // Why: share the normalizer's standalone-line marker rule. A naive indexOf
  // would treat base-drift commit subjects that mention `=== TASK ===` as the
  // real separator when helpers are called with raw multi-line preambles.
  const taskMarkerIndex = findDorkaDispatchTaskMarkerIndex(scan)
  if (taskMarkerIndex === -1) {
    return ''
  }
  const taskBodyStart = taskMarkerIndex + DORKA_DISPATCH_TASK_MARKER.length
  const taskBody = scan.slice(taskBodyStart, taskBodyStart + DORKA_DISPATCH_TASK_PREVIEW_SCAN_LIMIT)
  for (const line of taskBody.split(/\r?\n/)) {
    const preview = line.trim().replace(/\s+/g, ' ')
    if (preview) {
      return preview
    }
  }
  return ''
}
