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

  it('uses the pinned GPU-optional Selkies desktop and its rootless init', async () => {
    const [dockerfile, script] = await Promise.all([
      readFile('docker/computer/Dockerfile', 'utf8'),
      readFile('docker/computer/entrypoint.sh', 'utf8')
    ])

    expect(dockerfile).toContain('selkies-egl-desktop:26.04@sha256:')
    expect(dockerfile).not.toContain('nvidia-glx-desktop')
    expect(script).toContain(
      'exec setpriv --reuid=1000 --regid=1000 --init-groups /etc/container-entrypoint.sh "$@"'
    )
  })

  it('persists a private generated desktop password inside the Computer', async () => {
    const script = await readFile('docker/computer/entrypoint.sh', 'utf8')

    expect(script).toContain('password_file=/home/ubuntu/.dorka/desktop-password')
    expect(script).toContain("openssl rand -base64 24 | tr -d '\\n'")
    expect(script).toContain('chmod 0600 "$password_file"')
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
