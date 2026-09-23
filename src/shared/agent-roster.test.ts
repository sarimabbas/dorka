import { describe, expect, it } from 'vitest'
import { AgentReferenceSetSchema, RunSchema } from './agent-roster'

describe('RunSchema', () => {
  const run = {
    id: 'run-a',
    agentId: 'agent-a',
    computerId: 'computer-a',
    status: 'queued',
    prompt: 'Work',
    createdAt: 1
  }

  it('accepts legacy Computer-hosted Runs without adding a process host', () => {
    expect(RunSchema.parse(run)).toEqual(run)
  })

  it('accepts only explicit Computer or Server process placement', () => {
    expect(RunSchema.parse({ ...run, processHost: 'computer' })).toMatchObject({
      computerId: 'computer-a',
      processHost: 'computer'
    })
    expect(RunSchema.parse({ ...run, processHost: 'server' })).toMatchObject({
      computerId: 'computer-a',
      processHost: 'server'
    })
    expect(() => RunSchema.parse({ ...run, processHost: 'agent' })).toThrow()
  })
})

describe('AgentReferenceSetSchema', () => {
  it('accepts portable skill and MCP names without resource payloads', () => {
    expect(
      AgentReferenceSetSchema.parse({
        version: 1,
        items: [
          { kind: 'skill', name: 'code-review', scope: 'either' },
          { kind: 'mcp-server', name: 'linear', configId: 'workspace' }
        ]
      })
    ).toMatchObject({ version: 1, items: [{ name: 'code-review' }, { name: 'linear' }] })
  })

  it('rejects duplicate semantic references', () => {
    expect(() =>
      AgentReferenceSetSchema.parse({
        version: 1,
        items: [
          { kind: 'skill', name: 'review', scope: 'global' },
          { kind: 'skill', name: 'review', scope: 'global' }
        ]
      })
    ).toThrow('Agent references must be unique')
  })

  it('rejects paths, commands, environment, and arbitrary resource metadata', () => {
    for (const item of [
      { kind: 'skill', name: '../review', scope: 'global' },
      { kind: 'skill', name: '.', scope: 'global' },
      { kind: 'skill', name: '..', scope: 'global' },
      { kind: 'skill', name: 'review\u0085hidden', scope: 'global' },
      { kind: 'skill', name: 'review.', scope: 'global' },
      { kind: 'mcp-server', name: 'linear', configId: 'workspace', command: 'npx evil' },
      { kind: 'mcp-server', name: 'linear', configId: 'workspace', environment: { TOKEN: 'x' } }
    ]) {
      expect(() => AgentReferenceSetSchema.parse({ version: 1, items: [item] })).toThrow()
    }
  })
})
