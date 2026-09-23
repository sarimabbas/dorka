import { describe, expect, it } from 'vitest'
import {
  buildAgentFeatureSkillInstallArgs,
  buildAgentFeatureSkillInstallCommand,
  DORKA_CLI_SKILL_INSTALL_COMMAND,
  buildAgentFeatureSkillUpdateArgs,
  buildAgentFeatureSkillUpdateCommand,
  COMPUTER_USE_SKILL_UPDATE_COMMAND,
  EPHEMERAL_VMS_SKILL_UPDATE_COMMAND,
  LINEAR_TICKETS_SKILL_UPDATE_COMMAND,
  DORKA_LINEAR_SKILL_UPDATE_COMMAND,
  DORKA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND,
  DORKA_CLI_SKILL_UPDATE_COMMAND,
  ORCHESTRATION_SKILL_UPDATE_COMMAND
} from './agent-feature-install-commands'

describe('agent feature skill commands', () => {
  it('builds a global install command by default', () => {
    expect(buildAgentFeatureSkillInstallCommand(['dorka-cli'])).toBe(
      'npx skills add https://github.com/stablyai/orca --skill dorka-cli --global'
    )
  })

  it('drops --global when installing locally', () => {
    expect(buildAgentFeatureSkillInstallCommand(['dorka-cli'], { global: false })).toBe(
      'npx skills add https://github.com/stablyai/orca --skill dorka-cli'
    )
  })

  it('repeats --skill per name for multi-skill installs', () => {
    expect(buildAgentFeatureSkillInstallCommand(['dorka-cli', 'orchestration'])).toBe(
      'npx skills add https://github.com/stablyai/orca --skill dorka-cli --skill orchestration --global'
    )
    expect(buildAgentFeatureSkillInstallArgs(['dorka-cli', 'orchestration'])).toEqual([
      'skills',
      'add',
      'https://github.com/stablyai/orca',
      '--skill',
      'dorka-cli',
      '--skill',
      'orchestration',
      '--global'
    ])
  })

  it('keeps the copyable Settings commands interactive by default', () => {
    // Why: -y skips the agent picker. A human pasting from Settings should still
    // get it; only an unattended spawn opts in.
    expect(buildAgentFeatureSkillInstallCommand(['dorka-cli'])).not.toContain('-y')
    expect(buildAgentFeatureSkillUpdateCommand('dorka-cli')).not.toContain('-y')
    expect(DORKA_CLI_SKILL_INSTALL_COMMAND).not.toContain('-y')
    expect(DORKA_CLI_SKILL_UPDATE_COMMAND).not.toContain('-y')
  })

  it('refuses to skip prompts without an install target', () => {
    // Why: -y with no --agent is the one combination that makes `skills add`
    // install into every agent it knows (~75). No caller may express it.
    expect(() => buildAgentFeatureSkillInstallCommand(['dorka-cli'], { yes: true })).toThrow(
      'An install target is required when skipping prompts.'
    )
  })

  it('refuses a target the skills CLI would drop', () => {
    // Why: defence in depth behind the CLI's own check — the skills CLI silently
    // drops a `-`-leading --agent value, which empties its target list and
    // installs into every agent it knows.
    expect(() =>
      buildAgentFeatureSkillInstallCommand(['dorka-cli'], { yes: true, agents: ['-y'] })
    ).toThrow('"-y" is not a usable install target.')
    expect(() =>
      buildAgentFeatureSkillInstallArgs(['dorka-cli'], { yes: true, agents: ['universal', 'a b'] })
    ).toThrow('"a b" is not a usable install target.')
  })

  it('appends -y and the targets for an unattended run', () => {
    expect(
      buildAgentFeatureSkillInstallCommand(['dorka-cli'], { yes: true, agents: ['universal'] })
    ).toBe(
      'npx skills add https://github.com/stablyai/orca --skill dorka-cli --global --agent universal -y'
    )
    expect(buildAgentFeatureSkillUpdateCommand(['dorka-cli'], { global: false, yes: true })).toBe(
      'npx skills update dorka-cli --project -y'
    )
    expect(
      buildAgentFeatureSkillInstallArgs(['dorka-cli'], { yes: true, agents: ['universal'] }).at(-1)
    ).toBe('-y')
    expect(buildAgentFeatureSkillUpdateArgs(['dorka-cli'], { yes: true }).at(-1)).toBe('-y')
  })

  it('builds single-skill update commands', () => {
    expect(buildAgentFeatureSkillUpdateCommand('orchestration')).toBe(
      'npx skills update orchestration --global'
    )
  })

  it('trims and rejects blank update skill names', () => {
    expect(buildAgentFeatureSkillUpdateCommand('  dorka-cli  ')).toBe(
      'npx skills update dorka-cli --global'
    )
    expect(() => buildAgentFeatureSkillUpdateCommand('   ')).toThrow('A skill name is required.')
  })

  it('builds multi-skill update commands and selects project scope for --local', () => {
    expect(buildAgentFeatureSkillUpdateCommand(['dorka-cli', 'orchestration'])).toBe(
      'npx skills update dorka-cli orchestration --global'
    )
    expect(buildAgentFeatureSkillUpdateCommand(['dorka-cli'], { global: false })).toBe(
      'npx skills update dorka-cli --project'
    )
    expect(buildAgentFeatureSkillUpdateArgs(['dorka-cli'], { global: false })).toEqual([
      'skills',
      'update',
      'dorka-cli',
      '--project'
    ])
    expect(() => buildAgentFeatureSkillUpdateCommand([])).toThrow('A skill name is required.')
  })

  it('exports single-skill update constants without changing install bundles', () => {
    expect(DORKA_CLI_SKILL_UPDATE_COMMAND).toBe('npx skills update dorka-cli --global')
    expect(COMPUTER_USE_SKILL_UPDATE_COMMAND).toBe('npx skills update computer-use --global')
    expect(ORCHESTRATION_SKILL_UPDATE_COMMAND).toBe('npx skills update orchestration --global')
    expect(EPHEMERAL_VMS_SKILL_UPDATE_COMMAND).toBe(
      'npx skills update dorka-per-workspace-env --global'
    )
    expect(DORKA_LINEAR_SKILL_UPDATE_COMMAND).toBe('npx skills update dorka-linear --global')
    expect(LINEAR_TICKETS_SKILL_UPDATE_COMMAND).toBe('npx skills update linear-tickets --global')
    expect(DORKA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND).toBe(
      buildAgentFeatureSkillInstallCommand(['dorka-cli', 'orchestration'])
    )
  })
})
