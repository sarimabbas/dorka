import { describe, expect, it } from 'vitest'
import {
  createComputerArgs,
  DORKA_EXECUTION_GENERATION_ENV,
  DORKA_SSH_PUBLIC_KEY_ENV
} from './computer-runtime-command'

const executionGeneration = '10000000-0000-4000-8000-000000000001'
const publicKey = `ssh-ed25519 ${Buffer.from('public key bytes').toString('base64')} dorka-computer-alpha`

describe('createComputerArgs', () => {
  it('passes only the managed public key to the Computer', () => {
    const args = createComputerArgs(
      { id: 'alpha', image: 'safe/image:tag' },
      'server-01',
      publicKey,
      executionGeneration
    )

    expect(args.slice(-7)).toEqual([
      '--env',
      `${DORKA_SSH_PUBLIC_KEY_ENV}=${publicKey}`,
      '--env',
      `${DORKA_EXECUTION_GENERATION_ENV}=${executionGeneration}`,
      '--workdir',
      '/workspace',
      'safe/image:tag'
    ])
    expect(args).toEqual(expect.arrayContaining(['--shm-size', '2g']))
    expect(args).toEqual(
      expect.arrayContaining([
        '--mount',
        'type=volume,source=dorka-computer-alpha-ssh-host-keys,target=/etc/ssh'
      ])
    )
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
        publicKey,
        executionGeneration
      )
    ).toThrow('is managed by Dorka')
  })

  it('reserves the managed execution generation environment variable', () => {
    expect(() =>
      createComputerArgs(
        {
          id: 'alpha',
          image: 'safe/image:tag',
          environment: { [DORKA_EXECUTION_GENERATION_ENV]: 'caller-value' }
        },
        'server-01',
        publicKey,
        executionGeneration
      )
    ).toThrow('is managed by Dorka')
  })

  it('rejects a non-ed25519 public key', () => {
    expect(() =>
      createComputerArgs(
        { id: 'alpha', image: 'safe/image:tag' },
        'server-01',
        'secret',
        executionGeneration
      )
    ).toThrow('public key is invalid')
  })
})
