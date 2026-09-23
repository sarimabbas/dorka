import type { DorkaPushPayload } from './push-payload'

export type NativeDismissal = {
  remember(payload: DorkaPushPayload): Promise<void>
  wasDismissed(payload: DorkaPushPayload): Promise<boolean>
}
// Android and web use JavaScript storage; iOS requires the native ledger.
export const nativePushDismissal: NativeDismissal | null = null
