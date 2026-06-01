import { Command } from 'commander';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
import { ResolveService } from '../services/ResolveService';
import { ProjectService } from '../services/ProjectService';

export const runResolve = async (config: Config, name?: string, projectPath = process.cwd()) => {
  const profileSvc = new ProfileService(config);
  const finalName = name || new ProjectService(config, profileSvc).inferProfile(projectPath) || 'global-lite';
  return new ResolveService(config, profileSvc, new SkillService(config)).resolve(finalName);
};

export const registerResolve = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('resolve [profile]')
    .description('Print the resolved skill list for a profile (global and inbox excluded)')
    .action(async (name: string | undefined) => {
      const config = await getConfig();
      try {
        const r = await runResolve(config, name);
        console.log(`\nResolved ${r.name} (${r.skills.length} skills, global and inbox excluded):`);
        r.skills.forEach(s => console.log(`  - ${s}`));
        console.log('');
      } catch (e) {
        console.error(`\nError: ${e}\n`);
        process.exit(1);
      }
    });
};
