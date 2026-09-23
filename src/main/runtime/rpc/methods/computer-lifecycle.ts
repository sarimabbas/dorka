import { defineMethod } from '../core'
import {
  ComputerConfigurationGetParams,
  ComputerConfigurationMutationParams,
  ComputerGitIdentityParams,
  ComputerIdParams,
  CreateComputerParams,
  ListComputersParams,
  SetComputerGitIdentityParams
} from '../../../../shared/rpc-contract/computer-lifecycle-params'

export const COMPUTER_LIFECYCLE_METHODS = [
  defineMethod({
    name: 'computers.list',
    params: ListComputersParams,
    handler: async (_params, { runtime }) => runtime.listRuntimeComputers()
  }),
  defineMethod({
    name: 'computers.create',
    params: CreateComputerParams,
    handler: async (params, { runtime }) => runtime.createRuntimeComputer(params)
  }),
  defineMethod({
    name: 'computers.start',
    params: ComputerIdParams,
    handler: async (params, { runtime }) => runtime.startRuntimeComputer(params.id)
  }),
  defineMethod({
    name: 'computers.stop',
    params: ComputerIdParams,
    handler: async (params, { runtime }) => runtime.stopRuntimeComputer(params.id)
  }),
  defineMethod({
    name: 'computers.remove',
    params: ComputerIdParams,
    handler: async (params, { runtime }) => runtime.removeRuntimeComputer(params.id)
  }),
  defineMethod({
    name: 'computers.configuration.get',
    params: ComputerConfigurationGetParams,
    handler: async (params, { runtime }) => runtime.getComputerConfiguration(params.id)
  }),
  defineMethod({
    name: 'computers.configuration.plan',
    params: ComputerConfigurationMutationParams,
    handler: async (params, { runtime }) =>
      runtime.planComputerConfiguration(params.id, params.expectedRevision, params.configuration)
  }),
  defineMethod({
    name: 'computers.configuration.replace',
    params: ComputerConfigurationMutationParams,
    handler: async (params, { runtime }) =>
      runtime.replaceComputerConfiguration(params.id, params.expectedRevision, params.configuration)
  }),
  defineMethod({
    name: 'computers.gitIdentity.get',
    params: ComputerGitIdentityParams,
    handler: async (params, { runtime }) => runtime.getComputerGitIdentity(params.id)
  }),
  defineMethod({
    name: 'computers.gitIdentity.set',
    params: SetComputerGitIdentityParams,
    handler: async (params, { runtime }) =>
      runtime.setComputerGitIdentity(params.id, params.name, params.email)
  })
]
