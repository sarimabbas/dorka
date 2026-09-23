export type ComputerGitIdentity = {
  name: string | null
  email: string | null
}

export type ComputerGitIdentityInput = {
  name: string
  email: string
}

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+$/

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

export function isValidGitDisplayName(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 128 &&
    value === value.trim() &&
    !value.startsWith('-') &&
    !hasControlCharacter(value)
  )
}

export function isValidGitEmail(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 254 &&
    value === value.trim() &&
    !value.startsWith('-') &&
    !hasControlCharacter(value) &&
    EMAIL_PATTERN.test(value)
  )
}

export function assertValidComputerGitIdentity(identity: ComputerGitIdentityInput): void {
  if (!isValidGitDisplayName(identity.name)) {
    throw new Error('Git display name must be 1–128 characters without control characters')
  }
  if (!isValidGitEmail(identity.email)) {
    throw new Error('Git email must be a valid address of at most 254 characters')
  }
}
