import { Command } from 'commander';
import { Config, readConfig } from '../lib/config';
import { runProfilesList, runProfilesShow } from './profiles';

export const runPresetsList = runProfilesList;
export const runPresetsShow = runProfilesShow;

export const registerPresets = (program: Command, getConfig: () => Promise<Config> = readConfig): void => {
  const presetsCmd = program.command('preset').description('Manage skill presets');

  presetsCmd
    .command('list')
    .description('List all available presets')
    .action(async () => {
      const config = await getConfig();
      const presets = await runPresetsList(config);

      console.log('\nAvailable Presets:');
      for (const preset of presets) {
        const desc = preset.description ? `  ${preset.description}` : '';
        console.log(`  ${preset.name.padEnd(20)}${desc}`);
      }
      console.log('');
    });

  presetsCmd
    .command('show <name>')
    .description('Show preset details')
    .action(async (name: string) => {
      const config = await getConfig();
      const { profile: preset, validation } = await runPresetsShow(config, name);

      if (!preset) {
        console.log(`\nPreset not found: ${name}\n`);
        process.exit(1);
      }

      console.log(`\nPreset: ${preset.name}`);
      if (preset.description) {
        console.log(`Description: ${preset.description}`);
      }

      console.log(`\nSkills (${(preset.skills || []).length}):`);
      for (const skill of (preset.skills || [])) {
        const isWarn = validation?.warnings?.some(w => w.includes(skill));
        const icon = isWarn ? 'x' : '-';
        const warning = isWarn ? '  [WARN: Skill path does not exist]' : '';
        console.log(`  ${icon} ${skill}${warning}`);
      }

      if (validation && validation.errors.length > 0) {
        console.log('\nErrors:');
        validation.errors.forEach(err => console.log(`  x ${err}`));
      }

      if (validation && validation.warnings.length > 0) {
        console.log('\nWarnings:');
        validation.warnings.forEach(warn => console.log(`  - ${warn}`));
      }

      console.log('');
    });

  presetsCmd
    .command('validate <name>')
    .description('Validate preset skill references')
    .action(async (name: string) => {
      const config = await getConfig();
      const { profile: preset, validation } = await runPresetsShow(config, name);

      if (!preset || !validation) {
        console.log(`\nPreset not found: ${name}\n`);
        process.exit(1);
      }

      if (validation.valid && validation.warnings.length === 0) {
        console.log(`\nPreset valid: ${name}\n`);
        return;
      }

      console.log(`\nPreset has issues: ${name}`);
      validation.errors.forEach(err => console.log(`  x ${err}`));
      validation.warnings.forEach(warn => console.log(`  - ${warn}`));
      console.log('');

      if (!validation.valid) {
        process.exit(1);
      }
    });
};
