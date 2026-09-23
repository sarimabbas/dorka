import { homedir, tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppPathName } from '../../shared/app-environment'
import { resolveDorkadInstallRoot, resolveDorkadPath, resolveUserDataPath } from './dorkad-app-paths'

const ALL_PATH_NAMES: AppPathName[] = [
  'userData',
  'home',
  'appData',
  'temp',
  'downloads',
  'logs',
  'exe'
]

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value })
}

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform)
  vi.unstubAllEnvs()
})

describe('resolveUserDataPath', () => {
  it('prefers DORKA_USER_DATA, then XDG_DATA_HOME, then ~/.dorka', () => {
    vi.stubEnv('DORKA_USER_DATA', join(sep, 'srv', 'dorka-state'))
    vi.stubEnv('XDG_DATA_HOME', join(sep, 'xdg'))
    expect(resolveUserDataPath()).toBe(join(sep, 'srv', 'dorka-state'))

    vi.stubEnv('DORKA_USER_DATA', '')
    expect(resolveUserDataPath()).toBe(join(sep, 'xdg', 'Dorka'))

    vi.stubEnv('XDG_DATA_HOME', '')
    expect(resolveUserDataPath()).toBe(join(homedir(), '.dorka'))
  })
})

describe('resolveDorkadPath', () => {
  it('answers every path name without ever falling back to the data directory', () => {
    vi.stubEnv('DORKA_USER_DATA', join(sep, 'srv', 'dorka-state'))
    const answers = new Map(ALL_PATH_NAMES.map((name) => [name, resolveDorkadPath(name)]))

    for (const [name, answer] of answers) {
      expect(answer, `${name} answered nothing`).toBeTruthy()
      if (name !== 'userData') {
        // The catch-all this replaced returned the data directory for four of seven
        // names, 'exe' included — a data directory is not an executable.
        expect(answer, `${name} answered the userData directory`).not.toBe(
          join(sep, 'srv', 'dorka-state')
        )
      }
    }
  })

  it("answers 'exe' with the Node binary running this process", () => {
    expect(resolveDorkadPath('exe')).toBe(process.execPath)
  })

  it("keeps 'logs' inside the data root so the whole deployment is one directory", () => {
    vi.stubEnv('DORKA_USER_DATA', join(sep, 'srv', 'dorka-state'))
    expect(resolveDorkadPath('logs')).toBe(join(sep, 'srv', 'dorka-state', 'logs'))
  })

  it("answers 'home' and 'temp' from the OS", () => {
    expect(resolveDorkadPath('home')).toBe(homedir())
    expect(resolveDorkadPath('temp')).toBe(tmpdir())
  })

  it("answers 'appData' with the per-user application-data root of each platform", () => {
    setPlatform('darwin')
    expect(resolveDorkadPath('appData')).toBe(join(homedir(), 'Library', 'Application Support'))

    setPlatform('win32')
    vi.stubEnv('APPDATA', join('C:', 'Users', 'dorka', 'AppData', 'Roaming'))
    expect(resolveDorkadPath('appData')).toBe(join('C:', 'Users', 'dorka', 'AppData', 'Roaming'))
    vi.stubEnv('APPDATA', '')
    expect(resolveDorkadPath('appData')).toBe(join(homedir(), 'AppData', 'Roaming'))

    setPlatform('linux')
    vi.stubEnv('XDG_CONFIG_HOME', join(sep, 'xdg-config'))
    expect(resolveDorkadPath('appData')).toBe(join(sep, 'xdg-config'))
    vi.stubEnv('XDG_CONFIG_HOME', '')
    expect(resolveDorkadPath('appData')).toBe(join(homedir(), '.config'))
  })

  it("answers 'downloads' from XDG_DOWNLOAD_DIR before the home default", () => {
    vi.stubEnv('XDG_DOWNLOAD_DIR', join(sep, 'srv', 'incoming'))
    expect(resolveDorkadPath('downloads')).toBe(join(sep, 'srv', 'incoming'))

    vi.stubEnv('XDG_DOWNLOAD_DIR', '')
    expect(resolveDorkadPath('downloads')).toBe(join(homedir(), 'Downloads'))
  })
})

describe('resolveDorkadInstallRoot', () => {
  it('is the directory holding the running bundle, not the working directory', () => {
    expect(resolveDorkadInstallRoot(join(sep, 'opt', 'dorka', 'dorkad.js'))).toBe(
      join(sep, 'opt', 'dorka')
    )
  })

  it('absolutizes a relative script path against the working directory', () => {
    expect(resolveDorkadInstallRoot(join('out', 'dorkad', 'dorkad.js'))).toBe(
      join(process.cwd(), 'out', 'dorkad')
    )
  })

  it('refuses instead of guessing when the process has no main script', () => {
    const originalArgv = process.argv
    // `node -e` leaves argv[1] unset; cwd would be a guess, not an answer.
    process.argv = [process.execPath]
    try {
      expect(() => resolveDorkadInstallRoot()).toThrow(/dorkad_install_root_unavailable/)
    } finally {
      process.argv = originalArgv
    }
  })
})
