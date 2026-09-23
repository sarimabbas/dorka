export function verifyDesktopReadiness(engine, main, server) {
  engine([
    'exec',
    server,
    'bash',
    '-lc',
    'exec 3<>/dev/tcp/dorka-computer-main/2222; test "$(curl -ksS -o /dev/null -w "%{http_code}" https://dorka-computer-main:8080/)" = 401'
  ])
  const password = engine(['exec', main, 'cat', '/home/ubuntu/.dorka/desktop-password'])
  if (password.length < 24 || password === 'mypasswd') {
    throw new Error('unsafe password')
  }
  engine(
    [
      'exec',
      '-i',
      server,
      'bash',
      '-lc',
      'IFS= read -r password; curl -kfsS --user "ubuntu:${password}" https://dorka-computer-main:8080/ >/tmp/selkies.html'
    ],
    { input: `${password}\n` }
  )
  return password
}

export function selkiesServiceStatus(engine, main) {
  const status = engine([
    'exec',
    main,
    's6-svstat',
    '/etc/service/dbus',
    '/etc/service/xvfb',
    '/etc/service/selkies',
    '/etc/service/plasma'
  ])
  if (!status.split('\n').every((line) => /^(?:.*: )?up \(pid \d+\)/.test(line))) {
    throw new Error(`Selkies supervisor is degraded: ${JSON.stringify(status)}`)
  }
  return status
}
