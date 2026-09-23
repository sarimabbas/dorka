import { z } from 'zod'
import {
  isRelayCellConnectionHardCap,
  RELAY_CELL_CONNECTION_HARD_CAP,
  RELAY_MAX_CELL_CONNECTION_UNOBSERVED_BOUND,
  RELAY_DEFAULT_REGION,
  RelayRegionSchema,
  relayCellAdmissionBounds,
  type RelayCellConnectionHardCap,
  type RelayRegion
} from '@dorka-cloud/relay-contract'
import {
  RELAY_MAX_READINESS_GRACE_MS,
  RELAY_READINESS_JWKS_GRACE_MS,
  RELAY_READINESS_SQL_GRACE_MS
} from './relay-readiness.js'

export const RELAY_MAX_CELL_CAPACITY_REQUESTS = 100_000
export const RELAY_DATABASE_POOL_MAX = 10
export const RELAY_DIRECTOR_DATABASE_POOL_MAX = 3
export const RELAY_PUBLIC_RESOLVE_CONCURRENCY = 1
export const RELAY_PUBLIC_RESOLVE_WAIT_MS = 5_000
export { RELAY_CELL_CONNECTION_HARD_CAP }

const RelayCellConnectionHardCapSchema = z.custom<RelayCellConnectionHardCap>(
  isRelayCellConnectionHardCap
)

const EnvironmentBooleanSchema = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true')

const OptionalServiceAccountSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional()
)

// 0 disables the window and restores the fail-on-first-error readiness answer. An unset variable
// arrives as '' from Cloud Run, which z.coerce would read as 0 rather than as the default.
const readinessGraceSchema = (defaultMs: number) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(0).max(RELAY_MAX_READINESS_GRACE_MS).default(defaultMs)
  )

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DORKA_RELAY_PUBLIC_URL: z.string().url(),
  DORKA_RELAY_CELL_URL: z.string().url(),
  DORKA_RELAY_AUTH_ISSUER: z.string().url(),
  DORKA_RELAY_AUTH_AUDIENCE: z.literal('dorka-relay').default('dorka-relay'),
  DORKA_RELAY_JWKS_URL: z.string().url(),
  DORKA_RELAY_ASSIGNMENT_SIGNING_KEY: z.string().min(32),
  DORKA_RELAY_ROLE: z.enum(['combined', 'director', 'cell']).default('combined'),
  DORKA_RELAY_CELL_ID: z.string().min(1).max(128).default('combined'),
  DORKA_RELAY_REGION: RelayRegionSchema.default(RELAY_DEFAULT_REGION),
  DORKA_RELAY_CELL_CAPACITY: z.coerce
    .number()
    .int()
    .positive()
    .max(RELAY_MAX_CELL_CAPACITY_REQUESTS)
    .default(900),
  DORKA_RELAY_CELL_CONNECTION_HARD_CAP: z.coerce
    .number()
    .int()
    .pipe(RelayCellConnectionHardCapSchema)
    .optional(),
  DORKA_RELAY_CELL_CONNECTION_UNOBSERVED_BOUND: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(RELAY_MAX_CELL_CONNECTION_UNOBSERVED_BOUND)
    .optional(),
  DORKA_RELAY_CELLS_JSON: z.string().default('[]'),
  DORKA_RELAY_ADMIN_AUDIENCE: z.string().url(),
  DORKA_RELAY_DEPLOY_SERVICE_ACCOUNT: z.string().email(),
  DORKA_RELAY_CAPACITY_SERVICE_ACCOUNT: OptionalServiceAccountSchema,
  DORKA_RELAY_ASIA_PROOF_SERVICE_ACCOUNT: OptionalServiceAccountSchema,
  DORKA_RELAY_MONITOR_SERVICE_ACCOUNT: OptionalServiceAccountSchema,
  DORKA_RELAY_FENCE_SERVICE_ACCOUNT: OptionalServiceAccountSchema,
  DORKA_RELAY_FENCE_BROKER_SERVICE_ACCOUNT: OptionalServiceAccountSchema,
  DORKA_RELAY_REHOME_DIRECTOR_SERVICE_ACCOUNT: OptionalServiceAccountSchema,
  DORKA_RELAY_REHOME_AUDIENCE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional()
  ),
  DORKA_RELAY_RUNTIME_SERVICE_ACCOUNT: z.string().email().optional(),
  DORKA_RELAY_DIRECTOR_URL: z.string().url().optional(),
  DORKA_RELAY_HEARTBEAT_AUDIENCE: z.string().url().optional(),
  DORKA_RELAY_IMAGE_DIGEST: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  DORKA_RELAY_ADMIN_JWKS_URL: z.string().url().default('https://www.googleapis.com/oauth2/v3/certs'),
  DORKA_RELAY_DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).optional(),
  DORKA_RELAY_READINESS_JWKS_GRACE_MS: readinessGraceSchema(RELAY_READINESS_JWKS_GRACE_MS),
  DORKA_RELAY_READINESS_SQL_GRACE_MS: readinessGraceSchema(RELAY_READINESS_SQL_GRACE_MS),
  DORKA_RELAY_PUBLIC_ASSIGNMENTS_ENABLED: EnvironmentBooleanSchema,
  DORKA_RELAY_REGIONAL_PLACEMENT_ENABLED: EnvironmentBooleanSchema,
  DORKA_RELAY_REGION_CORRECTION_COHORT_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
  DORKA_RELAY_PUBLIC_ASSIGNMENT_CONCURRENCY: z.coerce.number().int().positive().max(100).default(2),
  DORKA_RELAY_PUBLIC_STICKY_CONCURRENCY: z.coerce.number().int().positive().max(100).default(1),
  DORKA_RELAY_PUBLIC_STICKY_QUEUE_MAX: z.coerce.number().int().positive().max(4_096).default(64),
  DORKA_RELAY_PUBLIC_STICKY_WAIT_MS: z.coerce.number().int().positive().max(30_000).default(2_000),
  DORKA_RELAY_PUBLIC_STICKY_RETRY_AFTER_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(60)
    .default(2),
  DORKA_RELAY_PUBLIC_ASSIGNMENT_QUEUE_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(4_096)
    .default(128),
  DORKA_RELAY_PUBLIC_ASSIGNMENT_WAIT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(30_000)
    .default(4_000),
  DORKA_RELAY_PUBLIC_ASSIGNMENT_RETRY_AFTER_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(300)
    .default(5),
  DATABASE_URL: z.string().optional(),
  DORKA_RELAY_DATA_DIR: z.string().default('./data/relay')
})

const RelayCellConfigSchema = z
  .object({
    id: z.string().min(1).max(128),
    url: z.string().url(),
    capacityRequests: z.number().int().positive().max(RELAY_MAX_CELL_CAPACITY_REQUESTS),
    region: RelayRegionSchema.default(RELAY_DEFAULT_REGION),
    initiallyEnabled: z.boolean().optional(),
    connectionHardCap: RelayCellConnectionHardCapSchema.optional(),
    connectionUnobservedBound: z
      .number()
      .int()
      .nonnegative()
      .max(RELAY_MAX_CELL_CONNECTION_UNOBSERVED_BOUND)
      .optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.connectionHardCap === undefined) !==
      (value.connectionUnobservedBound === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'connection hard cap and unobserved bound must be configured together'
      })
    } else if (
      value.connectionHardCap !== undefined &&
      value.connectionUnobservedBound! >
        relayCellAdmissionBounds(value.connectionHardCap).maxUnobservedBound
    ) {
      context.addIssue({
        code: 'custom',
        path: ['connectionUnobservedBound'],
        message: 'connection unobserved bound must leave ordinary admission capacity'
      })
    }
  })

export type RelayCellConfig = Omit<z.infer<typeof RelayCellConfigSchema>, 'region'> & {
  region?: RelayRegion
}

export type RelayConfig = {
  port: number
  publicUrl: string
  cellUrl: string
  authIssuer: string
  authAudience: 'dorka-relay'
  jwksUrl: string
  assignmentSigningKey: Uint8Array
  role: 'combined' | 'director' | 'cell'
  cellId: string
  region?: RelayRegion
  cells: RelayCellConfig[]
  adminAudience: string
  deployServiceAccount: string
  capacityServiceAccount?: string
  asiaProofServiceAccount?: string
  monitorServiceAccount?: string
  fenceServiceAccount?: string
  fenceBrokerServiceAccount?: string
  rehomeDirectorServiceAccount?: string
  rehomeAudience?: string
  runtimeServiceAccount: string
  directorUrl?: string
  heartbeatAudience?: string
  imageDigest?: string
  connectionHardCap?: RelayCellConnectionHardCap
  connectionUnobservedBound?: number
  adminJwksUrl: string
  databasePoolMax: number
  readinessJwksGraceMs?: number
  readinessSqlGraceMs?: number
  publicAssignmentsEnabled: boolean
  regionalPlacementEnabled?: boolean
  regionCorrectionCohortPercent?: number
  publicAssignmentConcurrency: number
  publicAssignmentQueueMax: number
  publicAssignmentWaitMs: number
  publicResolveConcurrency: number
  publicResolveWaitMs: number
  publicAssignmentRetryAfterSeconds: number
  publicStickyConcurrency?: number
  publicStickyQueueMax?: number
  publicStickyWaitMs?: number
  publicStickyRetryAfterSeconds?: number
  databaseUrl?: string
  dataDir: string
}

function canonicalOrigin(value: string, name: string): string {
  const url = new URL(value)
  if (url.origin !== value || url.pathname !== '/') throw new Error(`${name} must be an origin`)
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS outside loopback development`)
  }
  return value
}

export function loadRelayConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const parsed = EnvSchema.parse(env)
  const adminServiceAccounts = [
    parsed.DORKA_RELAY_DEPLOY_SERVICE_ACCOUNT,
    parsed.DORKA_RELAY_CAPACITY_SERVICE_ACCOUNT,
    parsed.DORKA_RELAY_ASIA_PROOF_SERVICE_ACCOUNT,
    parsed.DORKA_RELAY_MONITOR_SERVICE_ACCOUNT,
    parsed.DORKA_RELAY_FENCE_SERVICE_ACCOUNT,
    parsed.DORKA_RELAY_FENCE_BROKER_SERVICE_ACCOUNT,
    parsed.DORKA_RELAY_REHOME_DIRECTOR_SERVICE_ACCOUNT
  ].filter((value): value is string => value !== undefined)
  if (new Set(adminServiceAccounts).size !== adminServiceAccounts.length) {
    throw new Error('relay admin service accounts must be distinct')
  }
  if (
    (parsed.DORKA_RELAY_REHOME_DIRECTOR_SERVICE_ACCOUNT === undefined) !==
    (parsed.DORKA_RELAY_REHOME_AUDIENCE === undefined)
  ) {
    throw new Error('relay rehome identity and audience must be configured together')
  }
  if (
    parsed.DORKA_RELAY_REHOME_DIRECTOR_SERVICE_ACCOUNT &&
    parsed.DORKA_RELAY_REHOME_DIRECTOR_SERVICE_ACCOUNT ===
      (parsed.DORKA_RELAY_RUNTIME_SERVICE_ACCOUNT ?? parsed.DORKA_RELAY_DEPLOY_SERVICE_ACCOUNT)
  ) {
    throw new Error('relay rehome director identity must differ from the cell runtime identity')
  }
  if (
    parsed.DORKA_RELAY_REHOME_AUDIENCE &&
    new URL(parsed.DORKA_RELAY_REHOME_AUDIENCE).pathname !== '/v1/admin/host-drain'
  ) {
    throw new Error('relay rehome audience must target the host drain route')
  }
  const directorUrl = parsed.DORKA_RELAY_DIRECTOR_URL
    ? canonicalOrigin(parsed.DORKA_RELAY_DIRECTOR_URL, 'DORKA_RELAY_DIRECTOR_URL')
    : undefined
  const publicUrl = canonicalOrigin(parsed.DORKA_RELAY_PUBLIC_URL, 'DORKA_RELAY_PUBLIC_URL')
  const configuredCells = z
    .array(RelayCellConfigSchema)
    .max(128)
    .parse(JSON.parse(parsed.DORKA_RELAY_CELLS_JSON) as unknown)
    .map((cell) => ({ ...cell, url: canonicalOrigin(cell.url, `cell ${cell.id}`) }))
  const ownCell = {
    id: parsed.DORKA_RELAY_CELL_ID,
    region: parsed.DORKA_RELAY_REGION,
    url: canonicalOrigin(parsed.DORKA_RELAY_CELL_URL, 'DORKA_RELAY_CELL_URL'),
    capacityRequests: parsed.DORKA_RELAY_CELL_CAPACITY,
    connectionHardCap: parsed.DORKA_RELAY_CELL_CONNECTION_HARD_CAP,
    connectionUnobservedBound: parsed.DORKA_RELAY_CELL_CONNECTION_UNOBSERVED_BOUND,
    initiallyEnabled: true
  }
  if (
    (ownCell.connectionHardCap === undefined) !==
    (ownCell.connectionUnobservedBound === undefined)
  ) {
    throw new Error('connection hard cap and unobserved bound must be configured together')
  }
  if (
    ownCell.connectionHardCap !== undefined &&
    ownCell.connectionUnobservedBound! >
      relayCellAdmissionBounds(ownCell.connectionHardCap).maxUnobservedBound
  ) {
    throw new Error('connection unobserved bound must leave ordinary admission capacity')
  }
  const cells = parsed.DORKA_RELAY_ROLE === 'director' ? configuredCells : [ownCell]
  if (cells.length === 0) throw new Error('director requires at least one configured cell')
  if (new Set(cells.map(({ id }) => id)).size !== cells.length) {
    throw new Error('relay cell ids must be unique')
  }
  const databasePoolMax =
    parsed.DORKA_RELAY_DATABASE_POOL_MAX ??
    (parsed.DORKA_RELAY_ROLE === 'director'
      ? RELAY_DIRECTOR_DATABASE_POOL_MAX
      : RELAY_DATABASE_POOL_MAX)
  if (
    parsed.DORKA_RELAY_ROLE !== 'cell' &&
    parsed.DORKA_RELAY_PUBLIC_ASSIGNMENT_CONCURRENCY >= databasePoolMax
  ) {
    throw new Error('public relay admission must leave database pool headroom')
  }
  if (
    parsed.DORKA_RELAY_ROLE !== 'cell' &&
    parsed.DORKA_RELAY_PUBLIC_ASSIGNMENT_CONCURRENCY + parsed.DORKA_RELAY_PUBLIC_STICKY_CONCURRENCY >
      databasePoolMax
  ) {
    throw new Error('sticky and placement admission together must fit the database pool')
  }
  return {
    port: parsed.PORT,
    publicUrl,
    cellUrl: ownCell.url,
    authIssuer: canonicalOrigin(parsed.DORKA_RELAY_AUTH_ISSUER, 'DORKA_RELAY_AUTH_ISSUER'),
    authAudience: parsed.DORKA_RELAY_AUTH_AUDIENCE,
    jwksUrl: parsed.DORKA_RELAY_JWKS_URL,
    assignmentSigningKey: new TextEncoder().encode(parsed.DORKA_RELAY_ASSIGNMENT_SIGNING_KEY),
    role: parsed.DORKA_RELAY_ROLE,
    cellId: ownCell.id,
    region: ownCell.region,
    cells,
    adminAudience: parsed.DORKA_RELAY_ADMIN_AUDIENCE,
    deployServiceAccount: parsed.DORKA_RELAY_DEPLOY_SERVICE_ACCOUNT,
    capacityServiceAccount: parsed.DORKA_RELAY_CAPACITY_SERVICE_ACCOUNT,
    asiaProofServiceAccount: parsed.DORKA_RELAY_ASIA_PROOF_SERVICE_ACCOUNT,
    monitorServiceAccount: parsed.DORKA_RELAY_MONITOR_SERVICE_ACCOUNT,
    fenceServiceAccount: parsed.DORKA_RELAY_FENCE_SERVICE_ACCOUNT,
    fenceBrokerServiceAccount: parsed.DORKA_RELAY_FENCE_BROKER_SERVICE_ACCOUNT,
    rehomeDirectorServiceAccount: parsed.DORKA_RELAY_REHOME_DIRECTOR_SERVICE_ACCOUNT,
    rehomeAudience: parsed.DORKA_RELAY_REHOME_AUDIENCE,
    runtimeServiceAccount:
      parsed.DORKA_RELAY_RUNTIME_SERVICE_ACCOUNT ?? parsed.DORKA_RELAY_DEPLOY_SERVICE_ACCOUNT,
    directorUrl,
    heartbeatAudience:
      parsed.DORKA_RELAY_HEARTBEAT_AUDIENCE ??
      (directorUrl || parsed.DORKA_RELAY_ROLE === 'director'
        ? new URL('/v1/admin/cell-heartbeat', directorUrl ?? publicUrl).toString()
        : undefined),
    imageDigest: parsed.DORKA_RELAY_IMAGE_DIGEST,
    connectionHardCap: ownCell.connectionHardCap,
    connectionUnobservedBound: ownCell.connectionUnobservedBound,
    adminJwksUrl: parsed.DORKA_RELAY_ADMIN_JWKS_URL,
    databasePoolMax,
    readinessJwksGraceMs: parsed.DORKA_RELAY_READINESS_JWKS_GRACE_MS,
    readinessSqlGraceMs: parsed.DORKA_RELAY_READINESS_SQL_GRACE_MS,
    publicAssignmentsEnabled: parsed.DORKA_RELAY_PUBLIC_ASSIGNMENTS_ENABLED,
    regionalPlacementEnabled: parsed.DORKA_RELAY_REGIONAL_PLACEMENT_ENABLED,
    regionCorrectionCohortPercent: parsed.DORKA_RELAY_REGION_CORRECTION_COHORT_PERCENT,
    publicAssignmentConcurrency: parsed.DORKA_RELAY_PUBLIC_ASSIGNMENT_CONCURRENCY,
    publicAssignmentQueueMax: parsed.DORKA_RELAY_PUBLIC_ASSIGNMENT_QUEUE_MAX,
    publicAssignmentWaitMs: parsed.DORKA_RELAY_PUBLIC_ASSIGNMENT_WAIT_MS,
    publicResolveConcurrency: RELAY_PUBLIC_RESOLVE_CONCURRENCY,
    publicResolveWaitMs: RELAY_PUBLIC_RESOLVE_WAIT_MS,
    publicAssignmentRetryAfterSeconds: parsed.DORKA_RELAY_PUBLIC_ASSIGNMENT_RETRY_AFTER_SECONDS,
    publicStickyConcurrency: parsed.DORKA_RELAY_PUBLIC_STICKY_CONCURRENCY,
    publicStickyQueueMax: parsed.DORKA_RELAY_PUBLIC_STICKY_QUEUE_MAX,
    publicStickyWaitMs: parsed.DORKA_RELAY_PUBLIC_STICKY_WAIT_MS,
    publicStickyRetryAfterSeconds: parsed.DORKA_RELAY_PUBLIC_STICKY_RETRY_AFTER_SECONDS,
    databaseUrl: parsed.DATABASE_URL,
    dataDir: parsed.DORKA_RELAY_DATA_DIR
  }
}
