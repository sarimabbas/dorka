const MAIN = 'dorka-computer-main'
const SKILL_DIRECTORY = '/home/ubuntu/.agents/skills/native-acceptance'
const SKILL_FILE = `${SKILL_DIRECTORY}/SKILL.md`
const MCP_FILE = '/workspace/.mcp.json'
const REFERENCES = {
  version: 1,
  items: [
    { kind: 'skill', name: 'native-acceptance', scope: 'global' },
    { kind: 'mcp-server', name: 'acceptance-docs', configId: 'workspace' }
  ]
}

function referencesWithSkill(name) {
  return {
    version: 1,
    items: [
      { kind: 'skill', name, scope: 'global' },
      { kind: 'mcp-server', name: 'acceptance-docs', configId: 'workspace' }
    ]
  }
}

function installSkill(engine) {
  engine([
    'exec',
    MAIN,
    'bash',
    '-lc',
    `mkdir -p '${SKILL_DIRECTORY}' && printf '%s' '---
name: native-acceptance
description: Native acceptance fixture
---
' > '${SKILL_FILE}'`
  ])
}

function installMcp(engine, disabled) {
  const config = JSON.stringify({
    mcpServers: {
      'acceptance-docs': {
        type: 'http',
        url: 'https://acceptance.invalid/mcp',
        ...(disabled ? { disabled: true } : {})
      }
    }
  })
  engine(['exec', MAIN, 'bash', '-lc', `printf '%s' '${config}' > '${MCP_FILE}'`])
}

function terminalHandles(rpc, pairing) {
  const result = rpc(pairing, 'terminal.list', {})
  return result.terminals.map(({ handle }) => handle).sort()
}

function shimLaunchMarkers(engine) {
  const output = engine([
    'exec',
    MAIN,
    'bash',
    '-lc',
    'test ! -e /workspace/.dorka-agent-shim-launches || cat /workspace/.dorka-agent-shim-launches'
  ])
  return output ? output.split('\n') : []
}

export function assertPreSpawnFailure({
  afterHandles,
  beforeHandles,
  afterMarkers,
  beforeMarkers,
  expectedError,
  expectedRevision,
  failure,
  run
}) {
  if (!(failure instanceof Error) || !failure.message.includes(expectedError)) {
    throw new Error(`launch did not fail with ${expectedError}`)
  }
  if (
    run.status !== 'failed' ||
    run.agentRevision !== expectedRevision ||
    run.startedAt !== undefined ||
    run.terminalSessionId !== undefined ||
    run.processIdentity !== undefined
  ) {
    throw new Error('requirement failure crossed the terminal spawn boundary')
  }
  if (JSON.stringify(afterHandles) !== JSON.stringify(beforeHandles)) {
    throw new Error('requirement failure created a terminal')
  }
  if (JSON.stringify(afterMarkers) !== JSON.stringify(beforeMarkers)) {
    throw new Error('requirement failure launched the Agent shim')
  }
}

function requireLaunchFailure(context, expectedError, token) {
  const { agentId, engine, findRun, launch, pairing, requireValue, rpc } = context
  const beforeRuns = rpc(pairing, 'agents.runs.list', { agentId })
  const beforeHandles = terminalHandles(rpc, pairing)
  const beforeMarkers = shimLaunchMarkers(engine)
  let failure
  try {
    launch(pairing, agentId, 'main', token)
  } catch (error) {
    failure = error
  }
  const afterRuns = rpc(pairing, 'agents.runs.list', { agentId })
  requireValue(afterRuns.length === beforeRuns.length + 1, 'failed launch did not persist one Run')
  const priorIds = new Set(beforeRuns.map(({ id }) => id))
  const failedRun = afterRuns.find(({ id }) => !priorIds.has(id))
  requireValue(failedRun, 'failed requirement Run is missing')
  const agent = rpc(pairing, 'agents.list', {}).find(({ id }) => id === agentId)
  requireValue(agent, 'required Agent is missing')
  assertPreSpawnFailure({
    afterHandles: terminalHandles(rpc, pairing),
    afterMarkers: shimLaunchMarkers(engine),
    beforeHandles,
    beforeMarkers,
    expectedError,
    expectedRevision: agent.revision,
    failure,
    run: findRun(pairing, agentId, failedRun.id)
  })
  return failedRun
}

export function verifyAgentRequirements(context) {
  const {
    agentId,
    artifacts,
    artifact,
    engine,
    findRun,
    launch,
    names,
    pairing,
    requireValue,
    rpc,
    waitFor
  } = context
  const status = rpc(pairing, 'status.get', {})
  requireValue(
    status.capabilities.includes('agents.references.v1'),
    'Server did not advertise agents.references.v1'
  )
  installSkill(engine)
  installMcp(engine, false)

  const initialAgent = rpc(pairing, 'agents.list', {}).find(({ id }) => id === agentId)
  requireValue(initialAgent, 'Agent is missing before requirements update')
  const update = rpc(pairing, 'agents.references.update', {
    agentId,
    expectedRevision: initialAgent.revision,
    references: REFERENCES
  })
  requireValue(update.outcome === 'updated', 'Agent requirements update conflicted')
  const requiredAgent = update.agent
  const token = `run-${names.run}-requirements`
  const launched = launch(pairing, agentId, 'main', token)
  requireValue(
    launched.status === 'running' && launched.agentRevision === requiredAgent.revision,
    'required Run did not snapshot the Agent revision'
  )
  waitFor('required Agent marker', 6e4, () =>
    JSON.stringify(
      rpc(pairing, 'terminal.read', { terminal: launched.terminalSessionId ?? '', limit: 200 })
    ).includes('DORKA_NATIVE_AGENT_READY')
      ? true
      : void 0
  )

  const bumped = rpc(pairing, 'agents.references.update', {
    agentId,
    expectedRevision: requiredAgent.revision,
    references: REFERENCES
  })
  requireValue(
    bumped.outcome === 'updated' &&
      bumped.agent.revision === requiredAgent.revision + 1 &&
      findRun(pairing, agentId, launched.id).agentRevision === requiredAgent.revision,
    'running Run did not retain its Agent revision snapshot'
  )
  engine(['exec', MAIN, 'touch', `/workspace/${token}.exit`])
  waitFor('required Run exit', 6e4, () =>
    findRun(pairing, agentId, launched.id).status === 'waiting' ? true : void 0
  )

  const missingSkillName = `native-missing-${names.run}`
  const missingRequirement = rpc(pairing, 'agents.references.update', {
    agentId,
    expectedRevision: bumped.agent.revision,
    references: referencesWithSkill(missingSkillName)
  })
  requireValue(
    missingRequirement.outcome === 'updated' &&
      missingRequirement.agent.revision === bumped.agent.revision + 1,
    'missing-skill requirement did not advance the Agent revision'
  )
  const missingSkill = requireLaunchFailure(
    { agentId, engine, findRun, launch, pairing, requireValue, rpc },
    `Computer is missing required skill: ${missingSkillName}`,
    `run-${names.run}-missing-skill`
  )
  const restoredRequirement = rpc(pairing, 'agents.references.update', {
    agentId,
    expectedRevision: missingRequirement.agent.revision,
    references: REFERENCES
  })
  requireValue(
    restoredRequirement.outcome === 'updated' &&
      restoredRequirement.agent.revision === missingRequirement.agent.revision + 1,
    'restored requirement did not advance the Agent revision'
  )
  installMcp(engine, true)
  const disabledMcp = requireLaunchFailure(
    { agentId, engine, findRun, launch, pairing, requireValue, rpc },
    'Computer is missing required MCP server: acceptance-docs',
    `run-${names.run}-disabled-mcp`
  )
  installMcp(engine, false)

  artifact(artifacts, 'agent-requirements.json', {
    agentId,
    references: REFERENCES,
    successfulRun: {
      id: launched.id,
      agentRevision: launched.agentRevision,
      terminalSessionId: launched.terminalSessionId
    },
    revisionProgression: {
      initial: initialAgent.revision,
      required: requiredAgent.revision,
      bumped: bumped.agent.revision,
      missingSkill: missingRequirement.agent.revision,
      restored: restoredRequirement.agent.revision
    },
    preSpawnFailures: [
      { id: missingSkill.id, condition: 'missing-skill' },
      { id: disabledMcp.id, condition: 'disabled-mcp-server' }
    ],
    fixturePaths: [SKILL_FILE, MCP_FILE],
    repositoryCreated: false
  })
}
