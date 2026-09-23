import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  AgentRosterFileSchema,
  LegacyAgentRosterFileSchema,
  type AgentRosterFile,
  type LegacyAgentRosterFile
} from '../../shared/agent-roster'

const emptyRoster = (): AgentRosterFile => ({ version: 2, agents: [], runs: [] })

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function validateRelationships(roster: AgentRosterFile): void {
  const agentIds = new Set<string>()
  const runIds = new Set<string>()
  for (const agent of roster.agents) {
    if (agentIds.has(agent.id)) {
      throw new Error(`Duplicate Agent id: ${agent.id}`)
    }
    agentIds.add(agent.id)
  }
  for (const run of roster.runs) {
    if (runIds.has(run.id)) {
      throw new Error(`Duplicate Run id: ${run.id}`)
    }
    if (!agentIds.has(run.agentId)) {
      throw new Error(`Run ${run.id} references a missing Agent`)
    }
    runIds.add(run.id)
  }
}

function migrateLegacyRoster(legacy: LegacyAgentRosterFile): AgentRosterFile {
  return AgentRosterFileSchema.parse({
    version: 2,
    agents: legacy.agents.map((agent) => ({
      ...agent,
      revision: 1,
      references: { version: 1, items: [] }
    })),
    runs: legacy.runs
  })
}

export async function readAgentRoster(filePath: string): Promise<AgentRosterFile> {
  try {
    const value: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    const current = AgentRosterFileSchema.safeParse(value)
    const roster = current.success
      ? current.data
      : migrateLegacyRoster(LegacyAgentRosterFileSchema.parse(value))
    validateRelationships(roster)
    return roster
  } catch (error) {
    if (isMissingFile(error)) {
      return emptyRoster()
    }
    throw error
  }
}

export async function syncAgentRosterDirectory(directory: string): Promise<void> {
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

export async function persistAgentRoster(
  filePath: string,
  roster: AgentRosterFile,
  syncDirectory: (directory: string) => Promise<void>
): Promise<void> {
  AgentRosterFileSchema.parse(roster)
  validateRelationships(roster)
  const directory = dirname(filePath)
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    await writeFile(temporaryPath, `${JSON.stringify(roster, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    const temporaryFile = await open(temporaryPath, 'r')
    await temporaryFile.sync().finally(() => temporaryFile.close())
    await rename(temporaryPath, filePath)
    await syncDirectory(directory)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}
