export function migrateLegacyProductEnvironment(
  environment: Record<string, string | undefined>
): void {
  for (const [key, value] of Object.entries(environment)) {
    if (!key.startsWith('ORCA_') || value === undefined) {
      continue
    }

    const canonicalKey = `DORKA_${key.slice('ORCA_'.length)}`
    if (environment[canonicalKey] === undefined) {
      environment[canonicalKey] = value
    }
  }
}

migrateLegacyProductEnvironment(process.env)
