import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { composeManagedPtyExitEvidence } from './relay-runtime-services'

const COMPUTER_GENERATION = '11111111-1111-4111-8111-111111111111'

describe('RelayRuntimeServices managed PTY exit evidence composition', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dorka-relay-runtime-exit-evidence-'))
    mkdirSync(join(home, '.dorka'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it.skipIf(process.platform === 'win32')(
    'composes one journal at the stable Computer-home root for a valid marker',
    () => {
      writeFileSync(join(home, '.dorka', 'execution-generation'), `${COMPUTER_GENERATION}\n`)

      const composed = composeManagedPtyExitEvidence(home, 'linux')

      expect(composed?.computerExecutionGeneration).toBe(COMPUTER_GENERATION)
      expect(composed?.journal.listExact(COMPUTER_GENERATION, []).certificates).toEqual([])
      expect(existsSync(join(home, '.dorka', 'managed-pty-exits', 'v1', 'pending'))).toBe(true)
    }
  )

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['malformed', 'not-a-uuid'],
    ['padded', ` ${COMPUTER_GENERATION} `],
    ['multiple values', `${COMPUTER_GENERATION}\n${COMPUTER_GENERATION}`]
  ])('does not compose for a %s marker', (_case, marker) => {
    if (marker !== undefined) {
      writeFileSync(join(home, '.dorka', 'execution-generation'), marker)
    }

    expect(composeManagedPtyExitEvidence(home, 'linux')).toBeNull()
  })

  it('disables composition when the journal root cannot be created', () => {
    writeFileSync(join(home, '.dorka', 'execution-generation'), COMPUTER_GENERATION)
    writeFileSync(join(home, '.dorka', 'managed-pty-exits'), 'not a directory')

    expect(composeManagedPtyExitEvidence(home, 'linux')).toBeNull()
  })

  it('explicitly disables the Computer journal outside Linux', () => {
    writeFileSync(join(home, '.dorka', 'execution-generation'), COMPUTER_GENERATION)

    expect(composeManagedPtyExitEvidence(home, 'darwin')).toBeNull()
    expect(existsSync(join(home, '.dorka', 'managed-pty-exits'))).toBe(false)
  })
})
