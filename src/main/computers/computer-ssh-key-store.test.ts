import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ComputerSshKeyStore } from './computer-ssh-key-store'

async function dataDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dorka-computer-keys-'))
}

describe('ComputerSshKeyStore', () => {
  it('creates a unique ed25519 key for each Computer and reuses it', async () => {
    const directory = await dataDirectory()
    const store = new ComputerSshKeyStore(directory)

    const alpha = await store.loadOrCreatePublicKey('alpha')
    const beta = await store.loadOrCreatePublicKey('beta')
    const alphaAgain = await store.loadOrCreatePublicKey('alpha')

    expect(alpha).toMatch(/^ssh-ed25519 /)
    expect(beta).toMatch(/^ssh-ed25519 /)
    expect(beta).not.toBe(alpha)
    expect(alphaAgain).toBe(alpha)
    expect(await store.resolvePrivateKeyPath('alpha')).toBe(
      join(directory, 'computer-ssh-keys', 'alpha', 'id_ed25519')
    )
    expect(
      await readFile(join(directory, 'computer-ssh-keys', 'alpha', 'id_ed25519.pub'), 'utf8')
    ).toContain(alpha)
  })

  it('redacts a private key path from key generation failures', async () => {
    const directory = await dataDirectory()
    const privateKey = join(directory, 'computer-ssh-keys', 'alpha', 'id_ed25519')
    const store = new ComputerSshKeyStore(directory, async () => ({
      code: 1,
      signal: null,
      stdout: '',
      stderr: `failed to write ${privateKey}`,
      timedOut: false
    }))

    const error = await store.loadOrCreatePublicKey('alpha').catch((cause: unknown) => cause)

    expect(String(error)).toContain('[redacted-private-key-path]')
    expect(String(error)).not.toContain(privateKey)
  })

  it('does not expose the expected private path when identity resolution fails', async () => {
    const directory = await dataDirectory()
    const store = new ComputerSshKeyStore(directory)

    await expect(store.resolvePrivateKeyPath('missing')).rejects.toThrow(
      'Computer SSH identity is unavailable: missing'
    )
    await expect(store.resolvePrivateKeyPath('missing')).rejects.not.toThrow(directory)
  })

  it.skipIf(process.platform === 'win32')('pins private keys to mode 0600', async () => {
    const directory = await dataDirectory()
    const store = new ComputerSshKeyStore(directory)
    await store.loadOrCreatePublicKey('alpha')
    const privateKey = join(directory, 'computer-ssh-keys', 'alpha', 'id_ed25519')

    expect((await stat(privateKey)).mode & 0o777).toBe(0o600)
  })
})
