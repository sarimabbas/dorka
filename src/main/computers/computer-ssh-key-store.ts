import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
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
    const privateKeyPath = join(this.dataDirectory, KEY_DIRECTORY, computerId, PRIVATE_KEY_FILE)
    try {
      return await this.loadOrCreatePublicKeyUnsafe(computerId)
    } catch (error) {
      throw sanitizeIdentityError(error, privateKeyPath)
    }
  }

  private async loadOrCreatePublicKeyUnsafe(computerId: string): Promise<string> {
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

  async resolvePrivateKeyPath(computerId: string): Promise<string> {
    validateComputerId(computerId)
    const privateKeyPath = join(this.dataDirectory, KEY_DIRECTORY, computerId, PRIVATE_KEY_FILE)
    try {
      await access(privateKeyPath)
      await chmod(privateKeyPath, 0o600)
      return privateKeyPath
    } catch {
      throw new Error(`Computer SSH identity is unavailable: ${computerId}`)
    }
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

function sanitizeIdentityError(error: unknown, privateKeyPath: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(message.replaceAll(privateKeyPath, '[redacted-private-key-path]'))
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
