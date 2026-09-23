import { describe, expect, it } from 'vitest'
import { getLocalExecutionHostLabel } from '../../../src/shared/execution-host'
import {
  buildNewWorkspaceProjectOptions,
  buildNewWorkspaceRunTargetOptions,
  getNewWorkspaceRunTarget
} from './new-workspace-project-targets'

const LOCAL_HOST_LABEL = getLocalExecutionHostLabel('darwin')

describe('new workspace project targets', () => {
  it('groups local and SSH checkouts of the same project', () => {
    const upstream = { owner: 'stablyai', repo: 'dorka' }
    const options = buildNewWorkspaceProjectOptions([
      { id: 'local', displayName: 'dorka', path: '/src/dorka', upstream },
      {
        id: 'ssh',
        displayName: 'dorka',
        path: '/home/dev/dorka',
        connectionId: 'build-server',
        upstream
      }
    ])

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ label: 'dorka', detail: 'stablyai/orca' })
  })

  it('shows the provider slug recovered from canonical git identity', () => {
    const options = buildNewWorkspaceProjectOptions([
      {
        id: 'local',
        displayName: 'dorka',
        path: '/src/dorka',
        gitRemoteIdentity: {
          canonicalKey: 'github.com/stablyai/orca',
          remoteName: 'origin',
          remoteUrl: 'git@github.com:stablyai/orca.git'
        }
      }
    ])

    expect(options[0]).toMatchObject({ label: 'dorka', detail: 'stablyai/orca' })
  })

  it('labels local, SSH, and paired runtime targets', () => {
    expect(
      getNewWorkspaceRunTarget({ id: 'local', displayName: 'dorka', path: '/src/dorka' }, 'darwin')
    ).toEqual({ label: LOCAL_HOST_LABEL, detail: '/src/dorka' })
    expect(
      getNewWorkspaceRunTarget({ id: 'local', displayName: 'dorka', path: 'C:\\src\\dorka' })
    ).toEqual({ label: 'This computer', detail: 'C:\\src\\dorka' })
    expect(
      getNewWorkspaceRunTarget(
        { id: 'local', displayName: 'dorka', path: 'C:\\src\\dorka' },
        'win32'
      )
    ).toEqual({ label: 'Local Windows', detail: 'C:\\src\\dorka' })
    expect(
      getNewWorkspaceRunTarget({
        id: 'ssh',
        displayName: 'dorka',
        path: 'C:\\src\\dorka',
        executionHostId: 'ssh:Windows%20VM'
      })
    ).toEqual({ label: 'SSH · Windows VM', detail: 'C:\\src\\dorka' })
    expect(
      getNewWorkspaceRunTarget({
        id: 'runtime',
        displayName: 'dorka',
        path: '/src/dorka',
        executionHostId: 'runtime:devbox'
      })
    ).toEqual({ label: 'Remote · devbox', detail: '/src/dorka' })
  })

  it('shows one target per host when the project has multiple local worktrees', () => {
    const upstream = { owner: 'stablyai', repo: 'dorka' }
    const repos = [
      { id: 'local-a', displayName: 'dorka-a', path: '/src/dorka-a', upstream },
      { id: 'local-b', displayName: 'dorka-b', path: '/src/dorka-b', upstream },
      {
        id: 'ssh',
        displayName: 'dorka',
        path: '/home/dev/dorka',
        connectionId: 'build-server',
        upstream
      }
    ]
    const projectId = buildNewWorkspaceProjectOptions(repos)[0]?.id ?? null

    expect(buildNewWorkspaceRunTargetOptions(repos, projectId, 'darwin')).toEqual([
      expect.objectContaining({ id: 'local-a', label: LOCAL_HOST_LABEL, detail: '/src/dorka-a' }),
      expect.objectContaining({ id: 'ssh', label: 'SSH · build-server', detail: '/home/dev/dorka' })
    ])
  })
})
