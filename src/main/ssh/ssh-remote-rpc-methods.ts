import { LINEAR_AGENT_ACCESS_METHODS } from '../runtime/rpc/methods/linear-agent-access'
import { LINEAR_METHODS } from '../runtime/rpc/methods/linear'
import { ORCHESTRATION_METHODS } from '../runtime/rpc/methods/orchestration'
import { STATUS_METHODS } from '../runtime/rpc/methods/status'
import { TERMINAL_METHODS } from '../runtime/rpc/methods/terminal'

// The buffered SSH fallback implements only these command families. Keeping its dispatcher
// narrow prevents an internal compatibility path from widening a host's public RPC manifest.
export const SSH_REMOTE_RPC_METHODS = [
  ...STATUS_METHODS,
  ...TERMINAL_METHODS,
  ...ORCHESTRATION_METHODS,
  ...LINEAR_METHODS,
  ...LINEAR_AGENT_ACCESS_METHODS
]
