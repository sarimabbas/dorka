export function getDorkaCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'dorka-ide'
  }
  if (platform === 'win32') {
    return 'dorka.cmd'
  }
  return 'dorka'
}
