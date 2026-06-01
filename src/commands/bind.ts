import * as path from 'path';
import { Command } from 'commander';
import { Config, expandHome, readConfig, writeConfig } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { ProjectBinding } from '../types';

const normalizeBindingPath = (bindingPath: string): string =>
  path.resolve(expandHome(bindingPath));

export const runBindList = (config: Config): ProjectBinding[] =>
  [...(config.projectBindings || [])].sort((a, b) => a.path.localeCompare(b.path));

export const runBindAdd = async (
  config: Config,
  bindingPath: string,
  profile: string
): Promise<ProjectBinding[]> => {
  const profileSvc = new ProfileService(config);
  if (!(await profileSvc.getProfile(profile))) {
    throw new Error(`Profile not found: ${profile}`);
  }

  const normalizedPath = normalizeBindingPath(bindingPath);
  const bindings = [
    ...(config.projectBindings || []).filter(binding => normalizeBindingPath(binding.path) !== normalizedPath),
    { path: normalizedPath, profile },
  ].sort((a, b) => b.path.length - a.path.length);

  config.projectBindings = bindings;
  await writeConfig(config);
  return bindings;
};

export const runBindRemove = async (
  config: Config,
  bindingPath: string
): Promise<ProjectBinding[]> => {
  const normalizedPath = normalizeBindingPath(bindingPath);
  const bindings = (config.projectBindings || [])
    .filter(binding => normalizeBindingPath(binding.path) !== normalizedPath);

  config.projectBindings = bindings;
  await writeConfig(config);
  return bindings;
};

export const registerBind = (program: Command): void => {
  const bind = program
    .command('bind')
    .description('Manage project path to profile bindings');

  bind
    .command('list')
    .description('List project bindings')
    .action(async () => {
      const bindings = runBindList(await readConfig());
      if (bindings.length === 0) {
        console.log('No project bindings configured.');
        return;
      }
      for (const binding of bindings) {
        console.log(`${binding.path} -> ${binding.profile}`);
      }
    });

  bind
    .command('add <path>')
    .requiredOption('--profile <name>', 'Profile to use for this path')
    .description('Bind a project directory tree to a profile')
    .action(async (bindingPath: string, options: { profile: string }) => {
      try {
        const bindings = await runBindAdd(await readConfig(), bindingPath, options.profile);
        console.log(`Bound ${normalizeBindingPath(bindingPath)} -> ${options.profile}`);
        console.log(`${bindings.length} project binding${bindings.length === 1 ? '' : 's'} configured.`);
      } catch (error) {
        console.error(`\nError: ${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
      }
    });

  bind
    .command('remove <path>')
    .description('Remove a project binding')
    .action(async (bindingPath: string) => {
      const bindings = await runBindRemove(await readConfig(), bindingPath);
      console.log(`Removed binding for ${normalizeBindingPath(bindingPath)}`);
      console.log(`${bindings.length} project binding${bindings.length === 1 ? '' : 's'} configured.`);
    });
};
