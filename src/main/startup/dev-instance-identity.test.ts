import { describe, expect, it } from 'vitest'
import { getDevInstanceIdentity, shouldApplyPreReadyAppName } from './dev-instance-identity'

describe('dev-instance-identity', () => {
  it('keeps packaged identity stable', () => {
    expect(getDevInstanceIdentity(false, {})).toMatchObject({
      name: 'Dorka',
      appName: 'Dorka',
      isDev: false,
      devLabel: null,
      dockBadgeLabel: null,
      appUserModelId: 'com.stablyai.dorka'
    })
  })

  it('pins a stable dev appName across branches so the safeStorage key does not churn', () => {
    const a = getDevInstanceIdentity(true, { DORKA_DEV_BRANCH: 'feature/a' })
    const b = getDevInstanceIdentity(true, { DORKA_DEV_BRANCH: 'feature/b' })

    // Per-branch label differs (window title / app menu)...
    expect(a.name).not.toBe(b.name)
    // ...but the Keychain-driving appName is identical and distinct from prod.
    expect(a.appName).toBe('Dorka Dev')
    expect(b.appName).toBe('Dorka Dev')
    expect(a.appName).not.toBe('Dorka')
  })

  it('never renames a packaged build before ready', () => {
    // Packaged builds must keep deriving the safeStorage key from their own CFBundleName;
    // a pre-ready rename would repoint forks ("Dorka ALab Edition") at Dorka's key.
    expect(shouldApplyPreReadyAppName(getDevInstanceIdentity(false, {}))).toBe(false)
    expect(shouldApplyPreReadyAppName({ isDev: false })).toBe(false)
  })

  it('applies the dev name before ready so safeStorage sees it', () => {
    expect(shouldApplyPreReadyAppName(getDevInstanceIdentity(true, {}))).toBe(true)
  })

  it('derives a readable dev label from worktree and branch env', () => {
    const identity = getDevInstanceIdentity(true, {
      DORKA_DEV_REPO_ROOT: '/repo/worktrees/dev-indicator',
      DORKA_DEV_WORKTREE_NAME: 'dev-indicator',
      DORKA_DEV_BRANCH: 'nwparker/dev-indicator'
    })

    expect(identity).toMatchObject({
      isDev: true,
      devLabel: 'dev-indicator',
      devBranch: 'nwparker/dev-indicator',
      devWorktreeName: 'dev-indicator',
      devRepoRoot: '/repo/worktrees/dev-indicator'
    })
    expect(identity.name).toBe('Dorka: nwparker/dev-indicator')
    expect(identity.dockBadgeLabel).toBeNull()
    expect(identity.appUserModelId).toMatch(/^com\.stablyai\.dorka\.dev\.[a-f0-9]{10}$/)
  })

  it('includes the branch when it differs from the worktree basename', () => {
    const identity = getDevInstanceIdentity(true, {
      DORKA_DEV_REPO_ROOT: '/repo/worktrees/payment-ui',
      DORKA_DEV_WORKTREE_NAME: 'payment-ui',
      DORKA_DEV_BRANCH: 'feature/billing-shell'
    })

    expect(identity.devLabel).toBe('payment-ui @ feature/billing-shell')
    expect(identity.name).toBe('Dorka: feature/billing-shell')
    expect(identity.dockBadgeLabel).toBeNull()
  })

  it('allows an explicit label override', () => {
    const identity = getDevInstanceIdentity(true, {
      DORKA_DEV_INSTANCE_LABEL: 'manual label',
      DORKA_DEV_WORKTREE_NAME: 'dev-indicator',
      DORKA_DEV_BRANCH: 'feature/other'
    })

    expect(identity.devLabel).toBe('manual label')
    expect(identity.name).toBe('Dorka: feature/other')
    expect(identity.dockBadgeLabel).toBeNull()
  })
})
