import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'prepare-codex'],
    summary: 'Repair Dorka-managed Codex hook trust before a shell launch',
    usage: 'dorka agent hooks prepare-codex',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Dorka-managed agent status hooks are enabled',
    usage: 'dorka agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['dorka agent hooks status', 'dorka agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Dorka-managed agent status hooks and remove local hook entries',
    usage: 'dorka agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['dorka agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Dorka-managed agent status hooks',
    usage: 'dorka agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['dorka agent hooks on']
  }
]
