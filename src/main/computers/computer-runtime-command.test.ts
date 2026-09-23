import { describe, expect, it } from 'vitest'
import { createComputerArgs, DORKA_SSH_PUBLIC_KEY_ENV } from './computer-runtime-command'

const publicKey = `ssh-ed25519 ${Buffer.from('public key bytes').toString('base64')} dorka-computer-alpha`

describe('createComputerArgs', () => {
  it('passes only the managed public key to the Computer', () => {
    const args = createComputerArgs(
      { id: 'alpha', image: 'safe/image:tag' },
      'server-01',
      publicKey
    )

    expect(args.slice(-5)).toEqual([
      '--env',
      `${DORKA_SSH_PUBLIC_KEY_ENV}=${publicKey}`,
      '--workdir',
      '/workspace',
      'safe/image:tag'
    ])
    expect(args.join(' ')).not.toContain('PRIVATE KEY')
  })

  it('reserves the managed SSH environment variable', () => {
    expect(() =>
      createComputerArgs(
        {
          id: 'alpha',
          image: 'safe/image:tag',
          environment: { [DORKA_SSH_PUBLIC_KEY_ENV]: 'caller-value' }
        },
        'server-01',
        publicKey
      )
    ).toThrow('is managed by Dorka')
  })

  it('rejects a non-ed25519 public key', () => {
    expect(() =>
      createComputerArgs({ id: 'alpha', image: 'safe/image:tag' }, 'server-01', 'secret')
    ).toThrow('public key is invalid')
  })
})
