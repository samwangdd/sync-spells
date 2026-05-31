import { Command } from 'commander';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
import { ResolveService } from '../services/ResolveService';

export const runResolve = async (config: Config, name: string) =>
  new ResolveService(config, new ProfileService(config), new SkillService(config)).resolve(name);

export const registerResolve = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('resolve <profile>')
    .description('Print the resolved skill list for a profile (global excluded)')
    .action(async (name: string) => {
      const config = await getConfig();
      try {
        const r = await runResolve(config, name);
        console.log(`\nResolved ${r.name} (${r.skills.length} skills, global excluded):`);
        r.skills.forEach(s => console.log(`  - ${s}`));
        console.log('');
      } catch (e) {
        console.error(`\nError: ${e}\n`);
        process.exit(1);
      }
    });
};
