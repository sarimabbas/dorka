import { z } from 'zod'

const ComputerId = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'Computer id must be a lowercase DNS label of at most 63 characters'
  )
const ComputerImage = z
  .string()
  .max(255)
  .regex(
    /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)*(?:[a-z0-9]+(?:[._-][a-z0-9]+)*)(?:(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})|(?:@sha256:[a-f0-9]{64}))?$/,
    'Computer image is not a valid immutable command argument'
  )

const ComputerResources = z
  .object({
    cpus: z.number().finite().min(0.25).max(32).optional(),
    memoryMb: z.number().int().min(256).max(131_072).optional(),
    pids: z.number().int().min(32).max(4096).optional()
  })
  .strict()

const ComputerEnvironment = z
  .record(
    z.string(),
    z
      .string()
      .max(8192)
      .refine((value) => !value.includes('\0'))
  )
  .refine((value) => Object.keys(value).length <= 128)
  .refine((value) => Object.keys(value).every((key) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key)))

const ComputerMount = z
  .object({
    source: z.string().max(1024),
    target: z.string().max(1024),
    readOnly: z.boolean().optional()
  })
  .strict()

export const ListComputersParams = z.object({}).strict()

export const CreateComputerParams = z
  .object({
    id: ComputerId,
    image: ComputerImage,
    resources: ComputerResources.optional(),
    environment: ComputerEnvironment.optional(),
    mounts: z.array(ComputerMount).max(16).optional()
  })
  .strict()

export const ComputerIdParams = z.object({ id: ComputerId }).strict()
