#!/usr/bin/env node

import process from 'node:process'
import { spawn } from 'node-pty'

const timeoutMs = 2_000

async function probe(signal) {
  const terminal = spawn('/bin/bash', ['--noprofile', '--norc', '-i'], {
    cols: 80,
    rows: 24,
    cwd: '/tmp',
    env: { ...process.env, TERM: 'dumb' }
  })
  let output = ''
  let exited = false
  let exitCode = null
  terminal.onData((chunk) => {
    output += chunk
  })
  const exit = new Promise((resolve) => {
    terminal.onExit((event) => {
      exited = true
      exitCode = event.exitCode
      resolve()
    })
  })
  terminal.write(`bash -c 'printf DORKA_PTY_PROBE_${signal}; kill -${signal} "$PPID"; exit 23'\r`)
  await Promise.race([exit, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  const exitedBeforeCleanup = output.includes(`DORKA_PTY_PROBE_${signal}`) && exited
  if (!exited) {
    terminal.kill('SIGKILL')
    await Promise.race([exit, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  }
  return { signal, exitedBeforeCleanup, exitCode }
}

const term = await probe('TERM')
const kill = await probe('KILL')
const result = { term, kill }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

if (term.exitedBeforeCleanup || !kill.exitedBeforeCleanup) {
  process.exitCode = 1
}
