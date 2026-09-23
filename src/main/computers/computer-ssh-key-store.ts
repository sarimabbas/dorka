import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  runProcess,
  type ProcessResult,
  type ProcessSpec
} from '../../shared/child-process/run-process'
import { validateComputerId } from './computer-runtime-command'

const KEY_DIRECTORY = 'computer-ssh-keys'
const PRIVATE_KEY_FILE = 'id_ed25519'

export type ComputerSshKeyExecutor = (spec: ProcessSpec) => Promise<ProcessResult>

export class ComputerSshKeyStore {
  constructor(
    private readonly dataDirectory: string,
    private readonly execute: ComputerSshKeyExecutor = runProcess
  ) {}

  async loadOrCreatePublicKey(computerId: string): Promise<string> {
    validateComputerId(computerId)
    const directory = join(this.dataDirectory, KEY_DIRECTORY, computerId)
    const privateKeyPath = join(directory, PRIVATE_KEY_FILE)
    const publicKeyPath = `${privateKeyPath}.pub`
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700)

    try {
      const publicKey = await readFile(publicKeyPath, 'utf8')
      try {
        await chmod(privateKeyPath, 0o600)
      } catch (error) {
        if (isMissingFile(error)) {
          throw new Error(`Computer SSH private key is missing: ${computerId}`)
        }
        throw error
      }
      return validatePublicKey(publicKey)
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error
      }
    }

    try {
      await chmod(privateKeyPath, 0o600)
      const publicKey = validatePublicKey(
        (await this.runKeygen(['-y', '-f', privateKeyPath])).stdout
      )
      await writeFile(publicKeyPath, `${publicKey}\n`, { mode: 0o644 })
      return publicKey
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error
      }
    }

    await this.runKeygen([
      '-q',
      '-t',
      'ed25519',
      '-N',
      '',
      '-C',
      `dorka-computer-${computerId}`,
      '-f',
      privateKeyPath
    ])
    await chmod(privateKeyPath, 0o600)
    return validatePublicKey(await readFile(publicKeyPath, 'utf8'))
  }

  private async runKeygen(args: string[]): Promise<ProcessResult> {
    const result = await this.execute({ program: 'ssh-keygen', args })
    if (result.code !== 0 || result.timedOut) {
      const detail = result.stderr.trim() || `exit code ${String(result.code)}`
      throw new Error(`Computer SSH key generation failed: ${detail}`)
    }
    return result
  }
}

function validatePublicKey(value: string): string {
  const key = value.trim()
  if (!/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [^\r\n]+)?$/.test(key)) {
    throw new Error('Computer SSH public key is invalid')
  }
  return key
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
