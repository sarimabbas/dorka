import { stripCredentialsFromMessage } from './git-remote-error'
import type { DorkaVmRecipe } from './dorka-yaml-hook-types'

export function getProvisionedRootRecipeRepoUrl(
  checkoutMode: DorkaVmRecipe['checkoutMode'],
  remoteUrl: string | undefined
): string | undefined {
  if (checkoutMode !== 'provisioned-root' || !remoteUrl) {
    return undefined
  }
  return stripCredentialsFromMessage(remoteUrl)
}
