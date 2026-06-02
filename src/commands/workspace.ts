import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, expandHome } from '../lib/config';
import { checkSymlinkState } from '../lib/symlink';
import { defaultManifest, manifestPath, readManifest, writeManifest } from '../lib/workspace';

export interface WorkspaceInitResult {
  root: string;
  action: 'created' | 'unchanged';
}

export const runWorkspaceInit = async (root: string): Promise<WorkspaceInitResult> => {
  try {
    await fs.access(manifestPath(root));
    return { root, action: 'unchanged' };
  } catch {
    await writeManifest(root, { ...defaultManifest });
    return { root, action: 'created' };
  }
};

export interface WorkspaceDoctorResult {
  check: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export const runWorkspaceDoctor = async (
  config: Config,
  root: string,
): Promise<WorkspaceDoctorResult[]> => {
  const results: WorkspaceDoctorResult[] = [];
  const manifest = await readManifest(root);

  for (const dir of [manifest.library, manifest.profiles, manifest.agents]) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
      results.push({ check: `dir:${dir}`, status: 'ok', message: `directory exists: ${dir}` });
    } catch {
      results.push({ check: `dir:${dir}`, status: 'error', message: `missing directory: ${dir}` });
    }
  }

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }
    const toolBase = expandHome(toolConfig.configPath);
    for (const mapping of toolConfig.mappings) {
      const expected = path.join(expandHome(config.source), mapping.from);
      const target = path.join(toolBase, mapping.to);
      const state = await checkSymlinkState(target, expected);
      if (state === 'broken' || state === 'wrong-target') {
        results.push({
          check: `symlink:${toolKey}:${mapping.to}`,
          status: 'error',
          message: `symlink ${target} is ${state} (expected → ${expected}); run "spells sync" to repair`,
        });
      } else {
        results.push({
          check: `symlink:${toolKey}:${mapping.to}`,
          status: 'ok',
          message: `symlink ${toolKey}:${mapping.to} is ${state}`,
        });
      }
    }
  }

  return results;
};

export interface WorkspaceMigrateResult {
  root: string;
  created: string[];
}

export const runWorkspaceMigrate = async (root: string): Promise<WorkspaceMigrateResult> => {
  const manifest = await readManifest(root);
  const created: string[] = [];

  for (const dir of [manifest.library, manifest.profiles, manifest.agents]) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
    } catch {
      await fs.mkdir(full, { recursive: true });
      created.push(dir);
    }
  }

  return { root, created: created.sort() };
};

export const registerWorkspace = (program: Command, getConfig: () => Promise<Config>): void => {
  const ws = program.command('workspace').description('Manage the iCloud sync-spells workspace');

  ws.command('init')
    .description('Write workspace.json into the configured workspace root')
    .action(async () => {
      const config = await getConfig();
      const root = expandHome(config.source);
      const result = await runWorkspaceInit(root);
      console.log(`  ${result.action === 'created' ? '+' : '='} workspace.json: ${result.action} (${result.root})`);
    });

  ws.command('doctor')
    .description('Validate workspace directories and tool symlink health')
    .action(async () => {
      const config = await getConfig();
      const root = expandHome(config.source);
      const results = await runWorkspaceDoctor(config, root);
      for (const r of results) {
        const icon = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
        console.log(`  ${icon} ${r.message}`);
      }
      const hasErrors = results.some((r) => r.status === 'error');
      console.log(`\n${hasErrors ? '✗ Workspace issues found' : '✓ Workspace healthy'}\n`);
    });

  ws.command('migrate')
    .description('Create any missing manifest-declared directories')
    .action(async () => {
      const config = await getConfig();
      const root = expandHome(config.source);
      const result = await runWorkspaceMigrate(root);
      if (result.created.length === 0) {
        console.log('  = workspace already conforms to manifest');
      } else {
        for (const dir of result.created) {
          console.log(`  + created ${dir}`);
        }
      }
    });
};
