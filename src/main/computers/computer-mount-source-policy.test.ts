import { describe, expect, it } from 'vitest'
import { ComputerMountSourcePolicy } from './computer-mount-source-policy'

function spec(source: string) {
  return {
    id: 'alpha',
    image: 'safe/image:tag',
    mounts: [{ source, target: '/shared' }]
  }
}

describe('ComputerMountSourcePolicy', () => {
  it('authorizes an exact configured source without changing the engine path', () => {
    const policy = ComputerMountSourcePolicy.create(['/srv/dorka/shared'])

    expect(policy.authorize(spec('/srv/dorka/shared'))).toMatchObject({
      mounts: [{ source: '/srv/dorka/shared', target: '/shared', readOnly: true }]
    })
  })

  it('does not authorize descendants or alternate path spellings', () => {
    const policy = ComputerMountSourcePolicy.create(['/srv/dorka/shared'])

    expect(() => policy.authorize(spec('/srv/dorka/shared/child'))).toThrow(
      'Computer mount source is not allowlisted'
    )
    expect(() => policy.authorize(spec('/srv/dorka/alias'))).toThrow(
      'Computer mount source is not allowlisted'
    )
  })

  it('rejects duplicate and forbidden configured entries', () => {
    expect(() =>
      ComputerMountSourcePolicy.create(['/srv/dorka/shared', '/srv/dorka/shared'])
    ).toThrow('entries must be unique')
    expect(() => ComputerMountSourcePolicy.create(['/home/operator'])).toThrow(
      'Computer mount source is forbidden'
    )
  })
})
