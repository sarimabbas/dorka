import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Computer image SSH entrypoint', () => {
  it('deduplicates the managed key, preserves other lines, and disables passwords', async () => {
    const script = await readFile('docker/computer/entrypoint.sh', 'utf8')

    expect(script).toContain('grep -Fvx -- "$DORKA_SSH_PUBLIC_KEY" "$authorized_keys"')
    expect(script).toContain('printf \'%s\\n\' "$DORKA_SSH_PUBLIC_KEY"')
    expect(script).toContain('-o PasswordAuthentication=no')
    expect(script).toContain('-o KbdInteractiveAuthentication=no')
    expect(script).not.toContain('-o PasswordAuthentication=yes')
  })
})
