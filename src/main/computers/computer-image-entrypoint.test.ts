import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Computer image entrypoint', () => {
  it('deduplicates the managed key, preserves other lines, and disables passwords', async () => {
    const script = await readFile('docker/computer/entrypoint.sh', 'utf8')

    expect(script).toContain('grep -Fvx -- "$DORKA_SSH_PUBLIC_KEY" "$authorized_keys"')
    expect(script).toContain('printf \'%s\\n\' "$DORKA_SSH_PUBLIC_KEY"')
    expect(script).toContain('-o PasswordAuthentication=no')
    expect(script).toContain('-o KbdInteractiveAuthentication=no')
    expect(script).not.toContain('-o PasswordAuthentication=yes')
  })

  it('writes a root-authored generation marker and leaves a private relay journal parent', async () => {
    const script = await readFile('docker/computer/entrypoint.sh', 'utf8')

    expect(script).toContain('install -d -o root -g root -m 0755 /home/ubuntu/.dorka')
    expect(script).toContain(
      'install -d -o ubuntu -g ubuntu -m 0700 /home/ubuntu/.dorka/managed-pty-exits/v1'
    )
    expect(script).toContain('mv "$generation_marker" /home/ubuntu/.dorka/execution-generation')
    expect(script).toContain('chmod 0444 "$generation_marker"')
  })
})
