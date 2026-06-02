import { Command } from 'commander';
import * as fs from 'fs/promises';
import { Config, expandHome } from '../lib/config';
import { defaultManifest, manifestPath, writeManifest } from '../lib/workspace';

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
};
