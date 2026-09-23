import { RuntimeClientError } from '../../runtime-client'

export function resolveCompatibilityCliCommand(): 'dorka' | 'dorka-ide' | 'dorka-dev' {
  const configured = process.env.DORKA_CLI_COMMAND
  if (configured === 'dorka' || configured === 'dorka-ide' || configured === 'dorka-dev') {
    return configured
  }
  return process.platform === 'linux' ? 'dorka-ide' : 'dorka'
}

export function resolvePackagedWindowsCompatibilityCommand(): 'dorka' | 'dorka-ide' | undefined {
  if (process.env.DORKA_WINDOWS_PACKAGED_CLI_LAUNCHER !== '1') {
    return undefined
  }
  const command = process.env.DORKA_CLI_COMMAND
  if (command === 'dorka' || command === 'dorka-ide') {
    return command
  }
  throw new RuntimeClientError(
    'invalid_argument',
    'The packaged Dorka launcher did not provide a valid resume command. No question was created.'
  )
}

export async function flushOrchestrationStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function isDevCliInvocation(): boolean {
  return (
    process.env.DORKA_DEV_CLI_INVOCATION === '1' ||
    (process.env.DORKA_USER_DATA_PATH?.includes('dorka-dev') ?? false)
  )
}
