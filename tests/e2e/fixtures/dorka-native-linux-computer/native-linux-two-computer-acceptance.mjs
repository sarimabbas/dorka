const MAIN_ID = 'main'
const SECONDARY_ID = 'secondary'
const MAIN = `dorka-computer-${MAIN_ID}`
const SECONDARY = `dorka-computer-${SECONDARY_ID}`

export function verifyTwoComputerIsolation(context) {
  const {
    agentId,
    artifacts,
    artifact,
    desktopPassword,
    engine,
    findRun,
    fingerprint,
    launch,
    names,
    pairing,
    requireValue,
    rpc,
    waitFor,
    waitForComputerHealth
  } = context
  const createdSecondary = rpc(pairing, 'computers.create', {
    id: SECONDARY_ID,
    image: names.computerImage
  })
  requireValue(
    createdSecondary.id === SECONDARY_ID && createdSecondary.state === 'created',
    'Secondary Computer was not created'
  )
  const startedSecondary = rpc(pairing, 'computers.start', { id: SECONDARY_ID })
  requireValue(startedSecondary.state === 'running', 'Secondary Computer did not start')
  waitForComputerHealth(SECONDARY)
  const listedComputers = rpc(pairing, 'computers.list', {})
    .map(({ id, state }) => ({ id, state }))
    .sort((left, right) => left.id.localeCompare(right.id))
  requireValue(
    JSON.stringify(listedComputers) ===
      JSON.stringify([
        { id: MAIN_ID, state: 'running' },
        { id: SECONDARY_ID, state: 'running' }
      ]),
    'expected two running isolated Computers'
  )
  const markers = [
    [MAIN, 'main-home', 'main-workspace'],
    [SECONDARY, 'secondary-home', 'secondary-workspace']
  ]
  for (const [computer, home, workspace] of markers) {
    engine([
      'exec',
      computer,
      'bash',
      '-lc',
      `printf %s '${home}' > /home/ubuntu/.dorka-acceptance-home; printf %s '${workspace}' > /workspace/.dorka-acceptance-workspace`
    ])
  }
  const mountNames = (computer) =>
    Object.fromEntries(
      JSON.parse(engine(['inspect', computer, '--format', '{{json .Mounts}}'])).map((mount) => [
        mount.Destination,
        mount.Name
      ])
    )
  const mainMounts = mountNames(MAIN)
  const secondaryMounts = mountNames(SECONDARY)
  requireValue(
    mainMounts['/home/ubuntu'] === `${MAIN}-home` &&
      mainMounts['/workspace'] === `${MAIN}-workspace` &&
      secondaryMounts['/home/ubuntu'] === `${SECONDARY}-home` &&
      secondaryMounts['/workspace'] === `${SECONDARY}-workspace`,
    'Computer home/workspace volumes are not independently named'
  )
  const mainIdentity = { name: 'Main Acceptance', email: 'main@acceptance.invalid' }
  const secondaryIdentity = {
    name: 'Secondary Acceptance',
    email: 'secondary@acceptance.invalid'
  }
  requireValue(
    JSON.stringify(rpc(pairing, 'computers.gitIdentity.set', { id: MAIN_ID, ...mainIdentity })) ===
      JSON.stringify(mainIdentity),
    'Main Git identity was not set'
  )
  requireValue(
    JSON.stringify(
      rpc(pairing, 'computers.gitIdentity.set', {
        id: SECONDARY_ID,
        ...secondaryIdentity
      })
    ) === JSON.stringify(secondaryIdentity),
    'Secondary Git identity was not set'
  )
  engine(['restart', MAIN, SECONDARY])
  waitForComputerHealth(MAIN, 'Main after restart')
  waitForComputerHealth(SECONDARY, 'Secondary after restart')
  requireValue(
    engine([
      'exec',
      MAIN,
      'ssh-keygen',
      '-lf',
      '/etc/ssh/ssh_host_ed25519_key.pub',
      '-E',
      'sha256'
    ]) === fingerprint,
    'Computer SSH host key changed across restart'
  )
  requireValue(
    engine(['exec', MAIN, 'cat', '/home/ubuntu/.dorka/desktop-password']) === desktopPassword,
    'Computer desktop password changed across restart'
  )
  for (const [computer, home, workspace] of markers) {
    requireValue(
      engine(['exec', computer, 'cat', '/home/ubuntu/.dorka-acceptance-home']) === home &&
        engine(['exec', computer, 'cat', '/workspace/.dorka-acceptance-workspace']) === workspace,
      `${computer} did not preserve isolated home/workspace state`
    )
  }
  waitFor('Computer Git identities after restart', 6e4, () => {
    try {
      return JSON.stringify(rpc(pairing, 'computers.gitIdentity.get', { id: MAIN_ID })) ===
        JSON.stringify(mainIdentity) &&
        JSON.stringify(rpc(pairing, 'computers.gitIdentity.get', { id: SECONDARY_ID })) ===
          JSON.stringify(secondaryIdentity)
        ? true
        : void 0
    } catch {
      return void 0
    }
  })
  const secondaryGeneration = engine([
    'inspect',
    SECONDARY,
    '--format',
    '{{index .Config.Labels "dev.dorka.execution-generation"}}'
  ])
  const moved = rpc(pairing, 'agents.move', { agentId, computerId: SECONDARY_ID })
  requireValue(moved.lastComputerId === SECONDARY_ID, 'Agent move was not persisted')
  requireValue(
    rpc(pairing, 'agents.list', {}).find((agent) => agent.id === agentId)?.lastComputerId ===
      SECONDARY_ID,
    'Agent move was not visible in the durable roster'
  )
  const movedToken = `run-${names.run}-secondary`
  const movedRun = launch(pairing, agentId, SECONDARY_ID, movedToken)
  requireValue(
    movedRun.status === 'running' &&
      movedRun.computerId === SECONDARY_ID &&
      movedRun.computerExecutionGeneration === secondaryGeneration &&
      movedRun.processIdentity?.startsWith('ssh:runtime-ssh-computer-secondary@@'),
    'moved Run did not launch on Secondary'
  )
  waitFor('Secondary Agent marker', 6e4, () =>
    JSON.stringify(
      rpc(pairing, 'terminal.read', {
        terminal: movedRun.terminalSessionId ?? '',
        limit: 200
      })
    ).includes('DORKA_NATIVE_AGENT_READY')
      ? true
      : void 0
  )
  engine(['exec', SECONDARY, 'touch', `/workspace/${movedToken}.exit`])
  waitFor('Secondary Run exit', 6e4, () =>
    findRun(pairing, agentId, movedRun.id).status === 'waiting' ? true : void 0
  )
  artifact(artifacts, 'two-computer-isolation.json', {
    computers: listedComputers,
    volumes: { main: mainMounts, secondary: secondaryMounts },
    identities: { main: mainIdentity, secondary: secondaryIdentity },
    generations: { secondary: secondaryGeneration },
    movedRunId: movedRun.id
  })
}
