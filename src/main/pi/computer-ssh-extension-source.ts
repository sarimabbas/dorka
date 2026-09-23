export const DORKA_PI_COMPUTER_SSH_EXTENSION_FILE = 'dorka-computer-ssh.ts'

/** Builds the fail-closed Pi tool transport used by Computer-backed agent sessions. */
export function getPiComputerSshExtensionSource(): string {
  return String.raw`import { spawn } from 'node:child_process'
import { isAbsolute, relative, resolve } from 'node:path'
import path from 'node:path/posix'
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool
} from '@earendil-works/pi-coding-agent'

const REMOTE_ROOT = '/workspace'
const GENERATION_FILE = '$HOME/.dorka/execution-generation'
const SSH_EXECUTABLE = '/usr/bin/ssh'
const localRoot = resolve(process.cwd())

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error('Dorka Computer SSH is unavailable: missing ' + name)
  return value
}

function loadConfig() {
  const host = required('DORKA_COMPUTER_SSH_HOST')
  const portText = required('DORKA_COMPUTER_SSH_PORT')
  const user = required('DORKA_COMPUTER_SSH_USER')
  const identityFile = required('DORKA_COMPUTER_SSH_IDENTITY_FILE')
  const knownHostsFile = required('DORKA_COMPUTER_SSH_KNOWN_HOSTS_FILE')
  const generation = required('DORKA_COMPUTER_EXECUTION_GENERATION')
  const sourceDirectory = required('DORKA_COMPUTER_SOURCE_DIRECTORY')
  const port = Number(portText)

  if (!/^[A-Za-z0-9._-]+$/.test(host)) throw new Error('Dorka Computer SSH host is invalid')
  if (!/^[A-Za-z0-9._-]+$/.test(user)) throw new Error('Dorka Computer SSH user is invalid')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Dorka Computer SSH port is invalid')
  }
  if (!isAbsolute(identityFile) || !isAbsolute(knownHostsFile)) {
    throw new Error('Dorka Computer SSH credential paths must be absolute')
  }
  if (!generation || /[\r\n\0]/.test(generation)) {
    throw new Error('Dorka Computer execution generation is invalid')
  }

  const remoteRoot = path.normalize(sourceDirectory)
  if (
    !sourceDirectory.startsWith('/') ||
    remoteRoot !== sourceDirectory ||
    (remoteRoot !== REMOTE_ROOT && !remoteRoot.startsWith(REMOTE_ROOT + '/'))
  ) {
    throw new Error('Dorka Computer source directory must be a normalized /workspace path')
  }

  return { host, port: portText, user, identityFile, knownHostsFile, generation, remoteRoot }
}

let config
let configError
try {
  config = loadConfig()
} catch (error) {
  configError = error
}

function getConfig() {
  if (config) return config
  throw configError instanceof Error ? configError : new Error('Dorka Computer SSH is unavailable')
}

function quote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'"
}

function redact(value) {
  const current = config
  let text = String(value)
  if (current) {
    text = text.replaceAll(current.identityFile, '[private key]').replaceAll(current.knownHostsFile, '[known hosts]')
  }
  return text
}

function redactedStream(onData) {
  const secrets = config ? [config.identityFile, config.knownHostsFile] : []
  let pending = ''
  return {
    write(chunk) {
      pending += chunk.toString()
      let retained = 0
      for (const secret of secrets) {
        for (let length = 1; length < secret.length && length <= pending.length; length++) {
          if (pending.endsWith(secret.slice(0, length))) retained = Math.max(retained, length)
        }
      }
      const ready = retained ? pending.slice(0, -retained) : pending
      pending = retained ? pending.slice(-retained) : ''
      if (ready) onData(Buffer.from(redact(ready)))
    },
    end() {
      if (pending) onData(Buffer.from(redact(pending)))
      pending = ''
    }
  }
}

function remotePath(localPath) {
  const absolute = resolve(localPath)
  const suffix = relative(localRoot, absolute)
  if (suffix === '..' || suffix.startsWith('../') || isAbsolute(suffix)) {
    throw new Error('Path is outside the Dorka Computer workspace')
  }
  const unixSuffix = suffix.split(/[\\/]+/).filter(Boolean)
  const mapped = path.join(getConfig().remoteRoot, ...unixSuffix)
  if (mapped !== getConfig().remoteRoot && !mapped.startsWith(getConfig().remoteRoot + '/')) {
    throw new Error('Path is outside the Dorka Computer workspace')
  }
  return mapped
}

function checkedCommand(cwd, command) {
  const current = getConfig()
  return [
    'set -eu',
    'dorka_generation=$(cat ' + GENERATION_FILE + ')',
    '[ "$dorka_generation" = ' + quote(current.generation) + ' ] || { echo "Dorka Computer generation changed; refusing operation" >&2; exit 78; }',
    'cd -- ' + quote(remotePath(cwd)),
    command
  ].join('; ')
}

function sshArgs(command) {
  const current = getConfig()
  return [
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'ConnectionAttempts=1',
    '-o', 'ServerAliveInterval=5',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'UserKnownHostsFile=' + current.knownHostsFile,
    '-i', current.identityFile,
    '-p', current.port,
    '--', current.user + '@' + current.host,
    command
  ]
}

function startSsh(command) {
  return spawn(SSH_EXECUTABLE, sshArgs(command), { stdio: ['pipe', 'pipe', 'pipe'] })
}

function sshCollect(cwd, command, input) {
  return new Promise((resolvePromise, reject) => {
    let child
    try {
      child = startSsh(checkedCommand(cwd, command))
    } catch (error) {
      reject(new Error(redact(error instanceof Error ? error.message : error)))
      return
    }
    const stdout = []
    const stderr = []
    let settled = false
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      reject(new Error(redact(error.message)))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (code === 0) resolvePromise(Buffer.concat(stdout))
      else reject(new Error('Dorka Computer SSH failed (' + code + '): ' + redact(Buffer.concat(stderr).toString())))
    })
    if (input === undefined) child.stdin.end()
    else child.stdin.end(input)
  })
}

function readOperations() {
  return {
    readFile: (file) => sshCollect(localRoot, 'cat -- ' + quote(remotePath(file))),
    access: (file) => sshCollect(localRoot, 'test -r ' + quote(remotePath(file))).then(() => undefined),
    detectImageMimeType: async (file) => {
      const output = await sshCollect(localRoot, 'file --mime-type -b -- ' + quote(remotePath(file)))
      const mime = output.toString().trim()
      return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime) ? mime : null
    }
  }
}

function writeOperations() {
  return {
    writeFile: (file, content) => sshCollect(localRoot, 'base64 -d > ' + quote(remotePath(file)), Buffer.from(content).toString('base64')),
    mkdir: (directory) => sshCollect(localRoot, 'mkdir -p -- ' + quote(remotePath(directory))).then(() => undefined)
  }
}

function editOperations() {
  const reads = readOperations()
  const writes = writeOperations()
  return { readFile: reads.readFile, access: reads.access, writeFile: writes.writeFile }
}

function bashOperations() {
  return {
    exec: (command, cwd, { onData, signal, timeout }) => new Promise((resolvePromise, reject) => {
      if (signal?.aborted) {
        reject(new Error('aborted'))
        return
      }
      let child
      try {
        child = startSsh(checkedCommand(cwd, command))
      } catch (error) {
        reject(new Error(redact(error instanceof Error ? error.message : error)))
        return
      }
      let timedOut = false
      let settled = false
      const timer = timeout ? setTimeout(() => {
        timedOut = true
        child.kill()
      }, timeout * 1000) : undefined
      const cleanup = () => {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      const fail = (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(redact(error instanceof Error ? error.message : error)))
      }
      const onAbort = () => child.kill()
      const safeStderr = redactedStream(onData)
      signal?.addEventListener('abort', onAbort, { once: true })
      child.stdout.on('data', onData)
      child.stderr.on('data', (chunk) => safeStderr.write(chunk))
      child.on('error', fail)
      child.on('close', (code) => {
        if (settled) return
        settled = true
        safeStderr.end()
        cleanup()
        if (signal?.aborted) reject(new Error('aborted'))
        else if (timedOut) reject(new Error('timeout:' + timeout))
        else resolvePromise({ exitCode: code })
      })
      child.stdin.end()
    })
  }
}

export default function (pi) {
  const readTool = createReadTool(localRoot, { operations: readOperations() })
  const writeTool = createWriteTool(localRoot, { operations: writeOperations() })
  const editTool = createEditTool(localRoot, { operations: editOperations() })
  const bashTool = createBashTool(localRoot, { operations: bashOperations() })

  pi.registerTool(readTool)
  pi.registerTool(writeTool)
  pi.registerTool(editTool)
  pi.registerTool(bashTool)

  // Returning operations, even when configuration is invalid, prevents local fallback.
  pi.on('user_bash', () => ({ operations: bashOperations() }))
}
`
}
