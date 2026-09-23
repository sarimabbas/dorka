import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginInstallSource } from '../../shared/plugins/plugin-install-lockfile'
import {
  installBundledPlugin,
  installPluginFromLocalPath,
  readPluginLockfile
} from './plugin-install'
import { pluginInstallTrustError } from './plugin-install-trust'

const roots: string[] = []

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

async function writePlugin(root: string, publisher: string, id: string): Promise<void> {
  await writeFile(
    join(root, 'dorka-plugin.json'),
    JSON.stringify({
      manifestVersion: 1,
      id,
      publisher,
      name: 'Plugin',
      version: '1.0.0',
      engines: { dorka: '>=1.0.0' },
      pluginApi: 1,
      capabilities: []
    })
  )
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('plugin install trust', () => {
  it.each<[PluginInstallSource, string | null]>([
    [
      {
        kind: 'git',
        url: 'https://github.com/attacker/dorka-secrets.git',
        ref: 'main'
      },
      'reserved plugin identity community.dorka-secrets must resolve to the stablyai organization'
    ],
    [
      {
        kind: 'git',
        url: 'git@github.com:stablyai/dorka-secrets.git',
        ref: 'main'
      },
      null
    ]
  ])('enforces reserved source organization', (source, expected) => {
    expect(pluginInstallTrustError('community.dorka-secrets', source)).toBe(expected)
  })

  it('rejects locally installed reserved identities before publication', async () => {
    const sourcePath = await tempRoot('dorka-reserved-plugin-')
    const pluginsDir = await tempRoot('dorka-plugin-installs-')
    await writePlugin(sourcePath, 'stablyai', 'dorka-skills')

    await expect(
      installPluginFromLocalPath({ pluginsDir, sourcePath, hostVersion: '1.4.0' })
    ).resolves.toEqual({
      ok: false,
      error: 'reserved plugin identity stablyai.dorka-skills cannot be installed from a local path'
    })
    await expect(readPluginLockfile(pluginsDir)).resolves.toEqual({ version: 1, plugins: {} })
  })

  it('allows the app-bundled path only for the complete official identity', async () => {
    const sourcePath = await tempRoot('dorka-bundled-plugin-')
    const pluginsDir = await tempRoot('dorka-plugin-installs-')
    await writePlugin(sourcePath, 'stablyai', 'dorka-skills')

    const result = await installBundledPlugin({
      pluginsDir,
      sourcePath,
      hostVersion: '1.4.0',
      expectedPluginKey: 'stablyai.dorka-skills'
    })

    expect(result).toMatchObject({ ok: true, pluginKey: 'stablyai.dorka-skills' })
    const lock = await readPluginLockfile(pluginsDir)
    expect(lock.plugins['stablyai.dorka-skills']?.source).toEqual({
      kind: 'bundled',
      bundleId: 'stablyai.dorka-skills'
    })
  })

  it('blocks a killed plugin even when the caller bypasses marketplace UI', async () => {
    const sourcePath = await tempRoot('dorka-killed-plugin-')
    const pluginsDir = await tempRoot('dorka-plugin-installs-')
    await writePlugin(sourcePath, 'community', 'unsafe')

    await expect(
      installPluginFromLocalPath({
        pluginsDir,
        sourcePath,
        hostVersion: '1.4.0',
        blockedPluginReason: (pluginKey) =>
          pluginKey === 'community.unsafe' ? 'Security incident' : null
      })
    ).resolves.toEqual({
      ok: false,
      error: "plugin is blocked by Dorka's safety list: Security incident"
    })
  })
})
