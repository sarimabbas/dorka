import { randomBytes, randomUUID } from 'node:crypto'
import { open, readFile, rename, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isComputerExecutionGeneration,
  type ComputerDesiredState,
  type ComputerRecord
} from '../../shared/computer-runtime'
import { withFileTransactionLock } from '../file-transaction-lock'
import { validateComputerSpec } from './computer-runtime-command'

const STORE_FILE = 'computers.json'
const TEMPORARY_FILE_ATTEMPTS = 10

type LegacyComputerRecord = Omit<ComputerRecord, 'executionGeneration'> & {
  executionGeneration?: string
}
type StoredComputers = { version: 1; computers: LegacyComputerRecord[] }
type PersistencePoint =
  | 'before-file-sync'
  | 'after-file-sync'
  | 'after-rename'
  | 'before-directory-sync'

type ComputerRecordStoreOptions = {
  temporaryId?: () => string
  onPersistencePoint?: (point: PersistencePoint) => void | Promise<void>
  syncDirectory?: (directory: string) => Promise<void>
}

async function syncRecordDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') {
    return
  }
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close().catch(() => undefined)
  }
}

type RecordCommit<T> = {
  beforeCommit: (record: ComputerRecord) => Promise<void>
  afterCommit: (record: ComputerRecord) => Promise<T>
}

/** Transaction callbacks run under the cross-process lock and must not re-enter this store. */
export class ComputerRecordStore {
  private readonly path: string

  constructor(
    private readonly dataDirectory: string,
    private readonly options: ComputerRecordStoreOptions = {}
  ) {
    this.path = join(dataDirectory, STORE_FILE)
  }

  list(): Promise<ComputerRecord[]> {
    return this.withRecords((records) => structuredClone(records))
  }

  get(id: string): Promise<ComputerRecord | null> {
    return this.withRecords((records) => {
      const record = records.find((candidate) => candidate.spec.id === id)
      return record ? structuredClone(record) : null
    })
  }

  create<T>(record: ComputerRecord, commit: RecordCommit<T>): Promise<T> {
    return this.withRecords(async (records) => {
      if (records.some((candidate) => candidate.spec.id === record.spec.id)) {
        throw new Error(`Computer already exists: ${record.spec.id}`)
      }
      await commit.beforeCommit(structuredClone(record))
      await this.persist([...records, record])
      return commit.afterCommit(structuredClone(record))
    })
  }

  setDesiredState<T>(
    id: string,
    desiredState: ComputerDesiredState,
    commit: RecordCommit<T>
  ): Promise<T> {
    return this.withRecords(async (records) => {
      const record = requireRecord(records, id)
      await commit.beforeCommit(structuredClone(record))
      const next = { ...record, desiredState }
      await this.persist(records.map((candidate) => (candidate.spec.id === id ? next : candidate)))
      return commit.afterCommit(structuredClone(next))
    })
  }

  remove(id: string, apply: (record: ComputerRecord) => Promise<void>): Promise<void> {
    return this.withRecords(async (records) => {
      const record = requireRecord(records, id)
      await apply(structuredClone(record))
      await this.persist(records.filter((candidate) => candidate.spec.id !== id))
    })
  }

  withSnapshot<T>(inspect: (records: ComputerRecord[]) => Promise<T>): Promise<T> {
    return this.withRecords((records) => inspect(structuredClone(records)))
  }

  private withRecords<T>(apply: (records: ComputerRecord[]) => T | Promise<T>): Promise<T> {
    return withFileTransactionLock(this.path, async () => apply(await this.readAndMigrate()))
  }

  private async readAndMigrate(): Promise<ComputerRecord[]> {
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
      await this.persist(computers)
    }
    return computers
  }

  private async persist(computers: ComputerRecord[]): Promise<void> {
    const value: StoredComputers = { version: 1, computers }
    const { path: temporaryPath, file } = await this.openTemporaryFile()
    let openFile: FileHandle | undefined = file
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await this.options.onPersistencePoint?.('before-file-sync')
      await file.sync()
      await this.options.onPersistencePoint?.('after-file-sync')
      await file.close()
      openFile = undefined
      await rename(temporaryPath, this.path)
      await this.options.onPersistencePoint?.('after-rename')
      await this.options.onPersistencePoint?.('before-directory-sync')
      await (this.options.syncDirectory ?? syncRecordDirectory)(this.dataDirectory)
    } catch (error) {
      await openFile?.close().catch(() => undefined)
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async openTemporaryFile(): Promise<{ path: string; file: FileHandle }> {
    for (let attempt = 0; attempt < TEMPORARY_FILE_ATTEMPTS; attempt += 1) {
      const id = this.options.temporaryId?.() ?? randomBytes(16).toString('hex')
      const path = `${this.path}.${process.pid}.${id}.tmp`
      try {
        return { path, file: await open(path, 'wx', 0o600) }
      } catch (error) {
        if (!isAlreadyExists(error)) {
          throw error
        }
      }
    }
    throw new Error('Could not allocate a unique Computer record temporary file')
  }
}

function requireRecord(records: ComputerRecord[], id: string): ComputerRecord {
  const record = records.find((candidate) => candidate.spec.id === id)
  if (!record) {
    throw new Error(`Unknown Computer: ${id}`)
  }
  return record
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
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
