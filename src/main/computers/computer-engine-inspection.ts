export type ComputerEngineInspection = {
  Id: string
  Name: string
  Config: { Image: string; Labels: Record<string, string> }
  State: { Running: boolean; Status: string }
}

export function isComputerEngineInspection(value: unknown): value is ComputerEngineInspection {
  if (!value || typeof value !== 'object') {
    return false
  }
  if (!('Id' in value) || typeof value.Id !== 'string') {
    return false
  }
  if (!('Name' in value) || typeof value.Name !== 'string') {
    return false
  }
  if (!('Config' in value) || !value.Config || typeof value.Config !== 'object') {
    return false
  }
  if (!('Image' in value.Config) || typeof value.Config.Image !== 'string') {
    return false
  }
  if (!('Labels' in value.Config) || !isStringRecord(value.Config.Labels)) {
    return false
  }
  if (!('State' in value) || !value.State || typeof value.State !== 'object') {
    return false
  }
  return (
    'Running' in value.State &&
    typeof value.State.Running === 'boolean' &&
    'Status' in value.State &&
    typeof value.State.Status === 'string'
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}
