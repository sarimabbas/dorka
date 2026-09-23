import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const relayDeploy = readFileSync('src/main/ssh/ssh-relay-deploy.ts', 'utf8')

describe('dorkad server image relay package', () => {
  it('builds and packages the relay where the SSH deploy resolver can reach it', () => {
    expect(dockerfile).toContain('pnpm run build:relay')
    expect(dockerfile).toContain('COPY --from=build /src/out/relay /opt/dorka/out/relay')
    expect(dockerfile).toContain('DORKA_RELAY_PATH=/opt/dorka/out/relay')
    expect(relayDeploy).toContain('join(process.env.DORKA_RELAY_PATH, platform)')
  })
})
