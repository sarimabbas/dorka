// Sample Dorka plugin worker entry. Runs inside the out-of-process plugin
// worker (plain Node, no Electron), forked lazily on the first trigger. The
// default export receives the `dorka` API: command registration, event
// handlers, and the capability-gated host API.
export default function activate(dorka) {
  dorka.commands.register('hello-ping', async (args) => {
    const stored = await dorka.host.call('storage.get', { key: 'pings' })
    const count = (typeof stored?.value === 'number' ? stored.value : 0) + 1
    await dorka.host.call('storage.set', { key: 'pings', value: count })
    return { pong: true, count, args: args ?? null }
  })

  dorka.events.on('worktree.created', async (payload) => {
    dorka.log(`worktree created: ${payload.worktreeId} at ${payload.path}`)
    await dorka.host.call('notifications.show', {
      title: 'Worktree created',
      body: payload.path
    })
  })

  dorka.events.on('agent.status.changed', (payload) => {
    dorka.log(`agent status: ${payload.state} in ${payload.worktreeId ?? 'unknown worktree'}`)
  })
}
