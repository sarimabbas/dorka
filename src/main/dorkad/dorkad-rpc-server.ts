import {
  DORKAD_DISABLED_RUNTIME_CAPABILITIES,
  DORKAD_RPC_METHODS
} from '../runtime/rpc/methods/dorkad'
import { RuntimeRpcShutdown } from '../runtime/runtime-rpc/runtime-rpc-shutdown'
import type { DorkaRuntimeRpcServerOptions } from '../runtime/runtime-rpc/runtime-rpc-pairing-types'

export { DORKAD_DISABLED_RUNTIME_CAPABILITIES }

export class DorkadRuntimeRpcServer extends RuntimeRpcShutdown {
  constructor(options: Omit<DorkaRuntimeRpcServerOptions, 'methods'>) {
    super({ ...options, methods: DORKAD_RPC_METHODS })
  }
}
