import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { MaterializeService } from '../services/MaterializeService';

export const runMaterialize = async (config: Config, profileName: string) => {
  const profileSvc = new ProfileService(config);
  const materializeSvc = new MaterializeService(config, profileSvc);
  return await materializeSvc.materialize(profileName);
};

export const registerMaterialize = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('materialize <profile>')
    .option('--list', 'List materialized profiles')
    .description('Generate active skills directory from profile')
    .action(async (profileName: string, options: { list?: boolean }) => {
      const config = await getConfig();

      if (options.list) {
        const activeDir = config.activeDir || path.join(config.source, 'active-skills');
        try {
          const profiles = await fs.readdir(activeDir);
          console.log('\nMaterialized Profiles:');
          profiles.forEach(p => console.log(`  - ${p}`));
          console.log('');
        } catch {
          console.log('\nNo materialized profiles found.\n');
        }
        return;
      }

      try {
        const result = await runMaterialize(config, profileName);

        console.log(`\n✓ Materialized profile: ${result.profile}`);
        console.log(`  Generated at: ${new Date(result.generatedAt).toLocaleString()}`);
        console.log(`\nSkills (${result.skills.length}):`);

        for (const skill of result.skills) {
          const icon = skill.status === 'created' ? '+' :
                       skill.status === 'error' ? '✗' : '=';
          console.log(`  ${icon} ${skill.path}`);
          if (skill.error) {
            console.log(`    Error: ${skill.error}`);
          }
        }
        console.log('');
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });
};
