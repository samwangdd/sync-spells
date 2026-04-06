import * as path from 'path';
import { Command } from 'commander';
import { readConfig, expandHome } from '../lib/config';
import { checkSymlinkState, SymlinkState } from '../lib/symlink';

interface StatusEntry {
  tool: string;
  from: string;
  to: string;
  state: SymlinkState;
}

export const runStatus = async (): Promise<StatusEntry[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const sourceDir = expandHome(config.source);
  const entries: StatusEntry[] = [];

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }

    const toolBase = expandHome(toolConfig.configPath);

    for (const mapping of toolConfig.mappings) {
      const sourcePath = path.join(sourceDir, mapping.from);
      const targetPath = path.join(toolBase, mapping.to);
      const state = await checkSymlinkState(targetPath, sourcePath);
      entries.push({ tool: toolKey, from: mapping.from, to: mapping.to, state });
    }
  }

  return entries;
};

export const registerStatus = (program: Command): void => {
  program
    .command('status')
    .description('Show sync status for all tool mappings')
    .action(async () => {
      const entries = await runStatus();
      for (const entry of entries) {
        console.log(`  [${entry.tool}] ${entry.from} → ${entry.to}: ${entry.state}`);
      }
      if (entries.length === 0) {
        console.log('No enabled tools. Run `spells setup` to configure.');
      }
    });
};
