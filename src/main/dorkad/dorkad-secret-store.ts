import type { SecretStore } from '../../shared/secret-store'

/** dorkad has no OS keyring and must report that credentials remain unsealed. */
export function createDorkadSecretStore(): SecretStore {
  return {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('dorkad_secret_sealing_unavailable')
    },
    decryptString: () => {
      throw new Error('dorkad_secret_sealing_unavailable')
    },
    describeProtectionGap: () =>
      'This host has no OS keyring, so credentials are stored unencrypted. Pair from a desktop to manage secrets, or install and unlock a keyring.'
  }
}
