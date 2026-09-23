import { ACCOUNT_METHODS } from './accounts'
import { ARTIFACT_METHODS } from './artifacts'
import { DORKAD_RPC_METHOD_GROUPS } from './dorkad'
import { PLUGIN_METHODS } from './plugins'

// Why: reconstructing the full manifest around dorkad's unsupported families preserves the
// desktop/serve registration order while the Node-only bundle can import the smaller manifest.
export const ALL_RPC_METHODS = [
  ...DORKAD_RPC_METHOD_GROUPS.beforeArtifacts,
  ...ARTIFACT_METHODS,
  ...DORKAD_RPC_METHOD_GROUPS.beforeAccounts,
  ...ACCOUNT_METHODS,
  ...DORKAD_RPC_METHOD_GROUPS.beforePlugins,
  ...PLUGIN_METHODS,
  ...DORKAD_RPC_METHOD_GROUPS.afterPlugins
]
