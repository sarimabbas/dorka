import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isComputerExecutionGeneration, type ComputerRecord } from '../../shared/computer-runtime'
import { validateComputerSpec } from './computer-runtime-command'

const STORE_FILE = 'computers.json'

type LegacyComputerRecord = Omit<ComputerRecord, 'executionGeneration'> & {
  executionGeneration?: string
}
type StoredComputers = { version: 1; computers: LegacyComputerRecord[] }

export class ComputerRecordStore {
  private readonly path: string
  private loadInFlight: Promise<ComputerRecord[]> | null = null

  constructor(private readonly dataDirectory: string) {
    this.path = join(dataDirectory, STORE_FILE)
  }

  load(): Promise<ComputerRecord[]> {
    if (this.loadInFlight) {
      return this.loadInFlight
    }
    const pending = this.loadAndMigrate()
    this.loadInFlight = pending
    void pending.then(
      () => this.clearLoad(pending),
      () => this.clearLoad(pending)
    )
    return pending
  }

  private async loadAndMigrate(): Promise<ComputerRecord[]> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) {
        return []
      }
      throw error
    }

    const value: unknown = JSON.parse(text)
    if (!isStoredComputers(value)) {
      throw new Error('Invalid Computer record store')
    }
    let migrated = false
    const computers = value.computers.map((record): ComputerRecord => {
      validateComputerSpec(record.spec)
      if (record.executionGeneration === undefined) {
        migrated = true
        return { ...record, executionGeneration: randomUUID() }
      }
      if (!isComputerExecutionGeneration(record.executionGeneration)) {
        throw new Error('Invalid Computer execution generation')
      }
      return { ...record, executionGeneration: record.executionGeneration }
    })
    if (migrated) {
      await this.save(computers)
    }
    return computers
  }

  private clearLoad(pending: Promise<ComputerRecord[]>): void {
    if (this.loadInFlight === pending) {
      this.loadInFlight = null
    }
  }

  async save(computers: ComputerRecord[]): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`
    const value: StoredComputers = { version: 1, computers }
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, this.path)
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isStoredComputers(value: unknown): value is StoredComputers {
  if (!value || typeof value !== 'object' || !('version' in value) || !('computers' in value)) {
    return false
  }
  if (value.version !== 1 || !Array.isArray(value.computers)) {
    return false
  }
  return value.computers.every((record: unknown) => {
    if (
      !record ||
      typeof record !== 'object' ||
      !('desiredState' in record) ||
      !('spec' in record)
    ) {
      return false
    }
    return (
      (record.desiredState === 'running' || record.desiredState === 'stopped') &&
      !!record.spec &&
      typeof record.spec === 'object'
    )
  })
}
