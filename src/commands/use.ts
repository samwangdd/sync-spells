import { Command } from 'commander';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { ProjectService } from '../services/ProjectService';

export const runUse = async (
  config: Config,
  projectPath: string,
  profileName?: string
) => {
  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);

  const finalProfile = profileName ||
    projectSvc.inferProfile(projectPath) ||
    'global-lite';

  return await projectSvc.activateProfile(projectPath, finalProfile);
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

        console.log(`\nActivating preset: ${result.profile}`);
        console.log(`Linked ${result.skills.length} skills into this project.`);

        for (const skill of result.skills) {
          const icon = skill.status === 'linked' ? '-' : skill.status === 'error' ? 'x' : '-';
          console.log(`  ${icon} ${skill.name} -> ${skill.targetPath}`);
          if (skill.error) {
            console.log(`    Error: ${skill.error}`);
          }
        }

        console.log(`\nDone. Restart Claude Code or Codex if the tool has already loaded this project.\n`);
      } catch (error) {
        console.error(`\nError: ${error}\n`);
        process.exit(1);
      }
    });
};
