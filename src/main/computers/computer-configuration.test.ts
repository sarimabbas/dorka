import { describe, expect, it } from 'vitest'
import type { ComputerConfigurationInput, ComputerRecord } from '../../shared/computer-runtime'
import {
  computerConfigurationSnapshot,
  materializeComputerConfiguration,
  planComputerConfiguration
} from './computer-configuration'

const revision = '10000000-0000-4000-8000-000000000001'
const allowedMountSources = ['/srv/dorka/shared', '/srv/dorka/cache']

function record(overrides: Partial<ComputerRecord> = {}): ComputerRecord {
  return {
    spec: {
      id: 'main',
      image: 'computer:test',
      resources: { cpus: 2, memoryMb: 4096, pids: 512 },
      environment: { EXISTING_TOKEN: 'secret-value', FEATURE_FLAG: 'old-value' },
      mounts: [{ source: '/srv/dorka/shared', target: '/shared', readOnly: true }]
    },
    desiredState: 'stopped',
    executionGeneration: revision,
    ...overrides
  }
}

function configuration(
  overrides: Partial<ComputerConfigurationInput> = {}
): ComputerConfigurationInput {
  return {
    resources: { cpus: 2, memoryMb: 4096, pids: 512 },
    environment: { preserve: ['EXISTING_TOKEN', 'FEATURE_FLAG'], set: {} },
    premounts: [{ source: '/srv/dorka/shared', target: '/shared', readOnly: true }],
    ...overrides
  }
}

describe('Computer configuration', () => {
  it('returns a normalized snapshot with environment names but no values', () => {
    const snapshot = computerConfigurationSnapshot(record())

    expect(snapshot).toEqual({
      id: 'main',
      revision,
      configuration: {
        resources: { cpus: 2, memoryMb: 4096, pids: 512 },
        environment: ['EXISTING_TOKEN', 'FEATURE_FLAG'],
        premounts: [{ source: '/srv/dorka/shared', target: '/shared', readOnly: true }]
      }
    })
    expect(JSON.stringify(snapshot)).not.toContain('secret-value')
    expect(JSON.stringify(snapshot)).not.toContain('old-value')
  })

  it('preserves selected values, sets supplied values, and deletes omissions', () => {
    const spec = materializeComputerConfiguration(
      record().spec,
      configuration({
        environment: {
          preserve: ['EXISTING_TOKEN'],
          set: { FEATURE_FLAG: 'new-value', NEW_NAME: 'created-value' }
        }
      }),
      allowedMountSources
    )

    expect(spec.environment).toEqual({
      EXISTING_TOKEN: 'secret-value',
      FEATURE_FLAG: 'new-value',
      NEW_NAME: 'created-value'
    })
  })

  it('plans redacted named changes and a running interruption without leaking values', () => {
    const planned = planComputerConfiguration(
      record({ desiredState: 'running' }),
      configuration({
        resources: { cpus: 4, memoryMb: 4096, pids: 512 },
        environment: {
          preserve: [],
          set: { FEATURE_FLAG: 'new-value', NEW_NAME: '--privileged' }
        },
        premounts: [{ source: '/srv/dorka/cache', target: '/cache', readOnly: false }]
      }),
      allowedMountSources
    )

    expect(planned.plan).toMatchObject({
      id: 'main',
      revision,
      replacementRequired: true,
      interruption: 'restart',
      changes: {
        resources: ['cpus'],
        environment: {
          added: ['NEW_NAME'],
          changed: ['FEATURE_FLAG'],
          removed: ['EXISTING_TOKEN']
        },
        premountsChanged: true
      }
    })
    expect(planned.spec.environment.NEW_NAME).toBe('--privileged')
    expect(JSON.stringify(planned.plan)).not.toContain('new-value')
    expect(JSON.stringify(planned.plan)).not.toContain('--privileged')
    expect(JSON.stringify(planned.plan)).not.toContain('secret-value')
  })

  it('recognizes a no-op without rotating or interrupting anything', () => {
    const planned = planComputerConfiguration(record(), configuration(), allowedMountSources)

    expect(planned.plan.replacementRequired).toBe(false)
    expect(planned.plan.interruption).toBe('none')
    expect(planned.plan.changes).toEqual({
      resources: [],
      environment: { added: [], changed: [], removed: [] },
      premountsChanged: false
    })
  })

  it('rejects ambiguous or missing preservation without exposing existing values', () => {
    const invalid: ComputerConfigurationInput['environment'][] = [
      { preserve: ['EXISTING_TOKEN', 'EXISTING_TOKEN'], set: {} },
      { preserve: ['EXISTING_TOKEN'], set: { EXISTING_TOKEN: 'replacement' } },
      { preserve: ['MISSING'], set: {} }
    ]
    for (const environment of invalid) {
      expect(() =>
        materializeComputerConfiguration(
          record().spec,
          configuration({ environment }),
          allowedMountSources
        )
      ).toThrow()
      try {
        materializeComputerConfiguration(
          record().spec,
          configuration({ environment }),
          allowedMountSources
        )
      } catch (error) {
        expect(String(error)).not.toContain('secret-value')
      }
    }
  })

  it('enforces the exact host mount allowlist on the materialized configuration', () => {
    expect(() =>
      materializeComputerConfiguration(
        record().spec,
        configuration({
          premounts: [{ source: '/srv/dorka/shared/child', target: '/shared', readOnly: true }]
        }),
        allowedMountSources
      )
    ).toThrow('Computer mount source is not allowlisted: /srv/dorka/shared/child')
  })
})
