import { Command } from 'commander';
import { Config, readConfig } from '../lib/config';
import { Profile } from '../types';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
import { ResolveService, ResolvedProfile } from '../services/ResolveService';

export const runProfilesList = async (config: Config): Promise<Profile[]> => {
  const profileSvc = new ProfileService(config);
  return await profileSvc.listProfiles();
};

export const runProfilesShow = async (config: Config, name: string) => {
  const profileSvc = new ProfileService(config);
  const profile = await profileSvc.getProfile(name);
  const validation = profile ? await profileSvc.validateProfile(profile) : null;

  let resolved: ResolvedProfile | null = null;
  if (profile) {
    try {
      resolved = await new ResolveService(config, profileSvc, new SkillService(config)).resolve(name);
    } catch {
      resolved = null; // e.g. circular/deep extends — validation warnings still shown
    }
  }

  return { profile, validation, resolved };
};

export const registerProfiles = (program: Command, getConfig: () => Promise<Config> = readConfig): void => {
  const profilesCmd = program.command('profiles').description('Manage skill profiles');

  profilesCmd
    .command('list')
    .description('List all available profiles')
    .action(async () => {
      const config = await getConfig();
      const profiles = await runProfilesList(config);

      console.log('\nAvailable Profiles:');
      for (const profile of profiles) {
        const desc = profile.description ? `  ${profile.description}` : '';
        console.log(`  ${profile.name.padEnd(20)}${desc}`);
      }
      console.log('');
    });

  profilesCmd
    .command('show <name>')
    .description('Show profile details')
    .action(async (name: string) => {
      const config = await getConfig();
      const { profile, validation, resolved } = await runProfilesShow(config, name);

      if (!profile) {
        console.log(`\n❌ Profile not found: ${name}\n`);
        process.exit(1);
      }

      console.log(`\nProfile: ${profile.name}`);
      if (profile.description) {
        console.log(`Description: ${profile.description}`);
      }
      if (profile.extends) {
        console.log(`Extends: ${profile.extends}`);
      }
      if (profile.categories?.length) {
        console.log(`Categories: ${profile.categories.join(', ')}`);
      }
      if (profile.extras?.length) {
        console.log(`Extras: ${profile.extras.join(', ')}`);
      }
      if (profile.excludes?.length) {
        console.log(`Excludes: ${profile.excludes.join(', ')}`);
      }

      const skills = resolved?.skills ?? profile.skills ?? [];
      console.log(`\nSkills (${skills.length}, resolved):`);
      for (const skill of skills) {
        const isWarn = validation?.warnings?.some(w => w.includes(skill));
        const icon = isWarn ? '✗' : '✓';
        const warning = isWarn ? '  [WARN: Skill path does not exist]' : '';
        console.log(`  ${icon} ${skill}${warning}`);
      }

      if (validation && validation.errors.length > 0) {
        console.log('\nErrors:');
        validation.errors.forEach(err => console.log(`  ✗ ${err}`));
      }

      if (validation && validation.warnings.length > 0) {
        console.log('\nWarnings:');
        validation.warnings.forEach(warn => console.log(`  ⚠ ${warn}`));
      }

      console.log('');
    });
};
