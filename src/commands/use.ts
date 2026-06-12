import { Command } from 'commander';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { ProjectService } from '../services/ProjectService';
import { SkillService } from '../services/SkillService';
import { ResolveService } from '../services/ResolveService';
import { ProjectActivationResult } from '../types';

export const runUse = async (
  config: Config,
  projectPath: string,
  profileName?: string
) => {
  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);
  const finalProfile = profileName || projectSvc.inferProfile(projectPath) || 'global';
  const resolved = await new ResolveService(config, profileSvc, new SkillService(config)).resolve(finalProfile);
  return await projectSvc.activateSkills(projectPath, finalProfile, resolved.skills);
};

const agentLabels: Record<string, string> = {
  '.claude': 'Claude Code',
  '.codex': 'Codex',
};

const pluralizeSkills = (count: number): string => `${count} ${count === 1 ? 'skill' : 'skills'}`;

const agentLabelForTarget = (targetPath: string): string => {
  const agent = targetPath.split('/')[0];
  return agentLabels[agent] || agent.replace(/^\./, '') || 'Unknown';
};

export const formatUseResultLines = (result: ProjectActivationResult): string[] => {
  const groups = new Map<string, ProjectActivationResult['skills']>();
  for (const skill of result.skills) {
    const label = agentLabelForTarget(skill.targetPath);
    const group = groups.get(label) || [];
    group.push(skill);
    groups.set(label, group);
  }

  const lines = [
    '',
    `Activating preset: ${result.profile}`,
    `Linked ${pluralizeSkills(result.skills.length)} into this project.`,
  ];

  for (const [label, skills] of groups) {
    lines.push('', `${label} (${pluralizeSkills(skills.length)}):`);
    for (const skill of skills) {
      const icon = skill.status === 'linked' ? '-' : skill.status === 'error' ? 'x' : '-';
      lines.push(`  ${icon} ${skill.name} -> ${skill.targetPath}`);
      if (skill.error) {
        lines.push(`    Error: ${skill.error}`);
      }
    }
  }

  lines.push('', 'Done. Restart Claude Code or Codex if the tool has already loaded this project.', '');
  return lines;
};

export const registerUse = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('use [preset]')
    .option('--profile <name>', 'Specify profile name')
    .description('Activate preset in current project')
    .action(async (preset: string | undefined, options: { profile?: string }) => {
      const config = await getConfig();
      const projectPath = process.cwd();
      const profileName = preset || options.profile;

      try {
        const result = await runUse(config, projectPath, profileName);

        for (const line of formatUseResultLines(result)) console.log(line);
      } catch (error) {
        console.error(`\nError: ${error}\n`);
        process.exit(1);
      }
    });
};
