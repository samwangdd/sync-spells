import { Command } from 'commander';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { MaterializeService } from '../services/MaterializeService';
import { ProjectService } from '../services/ProjectService';

export const runUse = async (
  config: Config,
  projectPath: string,
  profileName?: string
) => {
  const profileSvc = new ProfileService(config);
  const materializeSvc = new MaterializeService(config, profileSvc);
  const projectSvc = new ProjectService(config, profileSvc);

  const finalProfile = profileName ||
    projectSvc.inferProfile(projectPath) ||
    'global-lite';

  await materializeSvc.materialize(finalProfile);

  const result = await projectSvc.activateProfile(projectPath, finalProfile);

  return result;
};

export const registerUse = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('use')
    .option('--profile <name>', 'Specify profile name')
    .description('Activate profile in current project')
    .action(async (options: { profile?: string }) => {
      const config = await getConfig();
      const projectPath = process.cwd();

      try {
        const result = await runUse(config, projectPath, options.profile);

        console.log(`\n✓ Activating ${result.skills.length} skills`);

        for (const skill of result.skills) {
          const icon = skill.status === 'linked' ? '✓' : skill.status === 'error' ? '✗' : '⊘';
          console.log(`  ${icon} ${skill.name} → ${skill.targetPath}`);
          if (skill.error) {
            console.log(`    Error: ${skill.error}`);
          }
        }

        const linked = result.skills.filter(s => s.status === 'linked').length;
        console.log(`\n✓ Done! Restart Claude Code to see changes.\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });
};
