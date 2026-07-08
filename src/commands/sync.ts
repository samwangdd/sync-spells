import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import { readConfig, expandHome } from '../lib/config';
import { checkSymlinkState, createSymlink, removeSymlink } from '../lib/symlink';
import { backupPath } from '../lib/backup';
import { runAgentSync } from './sync-agents';
import { runGuidanceSync } from './sync-guidance';
import { runGlobalSync } from './sync-global';

interface SyncResult {
  tool: string;
  from: string;
  to: string;
  action: 'linked' | 'skipped' | 'backed-up' | 're-linked';
}

export const runSync = async (): Promise<SyncResult[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const sourceDir = expandHome(config.source);
  const results: SyncResult[] = [];

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }

    const toolBase = expandHome(toolConfig.configPath);

    for (const mapping of toolConfig.mappings) {
      // `global` is a reserved mapping handled by the global-profile pass (runGlobalSync).
      if (mapping.from === 'global') {
        continue;
      }
      const sourcePath = path.join(sourceDir, mapping.from);
      const targetPath = path.join(toolBase, mapping.to);

      // Check if source subdirectory exists
      try {
        await fs.access(sourcePath);
      } catch {
        results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'skipped' });
        continue;
      }

      const state = await checkSymlinkState(targetPath, sourcePath);

      switch (state) {
        case 'linked':
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'skipped' });
          break;

        case 'missing':
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await createSymlink(sourcePath, targetPath);
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'linked' });
          break;

        case 'real-dir':
          await backupPath(targetPath);
          await fs.rm(targetPath, { recursive: true, force: true });
          await createSymlink(sourcePath, targetPath);
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'backed-up' });
          break;

        case 'broken':
        case 'wrong-target':
          await removeSymlink(targetPath);
          await createSymlink(sourcePath, targetPath);
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 're-linked' });
          break;
      }
    }
  }

  return results;
};

export const registerSync = (program: Command): void => {
  program
    .command('sync')
    .description('Sync spells from source to all enabled tools')
    .action(async () => {
      const results = await runSync();
      for (const r of results) {
        const icon = r.action === 'skipped' ? '=' : '+';
        console.log(`  ${icon} [${r.tool}] ${r.from} → ${r.to}: ${r.action}`);
      }
      const changed = results.filter((r) => r.action !== 'skipped').length;
      console.log(`\nSkills: ${changed} updated, ${results.length - changed} unchanged.`);

      try {
        const globalResults = await runGlobalSync();
        for (const r of globalResults) {
          const icon = r.action === 'error' ? '✗' : r.action === 'skipped' ? '=' : '+';
          const suffix = r.error ? ` (${r.error})` : '';
          console.log(`  ${icon} [${r.tool}] global ${r.skill}: ${r.action}${suffix}`);
        }
        const globalChanged = globalResults.filter(
          (r) => r.action === 'linked' || r.action === 'updated' || r.action === 'pruned',
        ).length;
        const globalUnchanged = globalResults.filter((r) => r.action === 'skipped').length;
        const globalErrors = globalResults.filter((r) => r.action === 'error').length;
        console.log(
          `Global skills: ${globalChanged} updated, ${globalUnchanged} unchanged${globalErrors ? `, ${globalErrors} error(s)` : ''}.`,
        );
      } catch (e) {
        console.log(`Global skills: skipped (${e instanceof Error ? e.message : String(e)})`);
      }

      try {
        const guidanceResults = await runGuidanceSync();
        for (const r of guidanceResults) {
          const icon = r.action === 'error' ? '✗' : r.action === 'skipped' ? '=' : '+';
          const suffix = r.error ? ` (${r.error})` : '';
          console.log(`  ${icon} [${r.tool}] global guidance → ${r.target}: ${r.action}${suffix}`);
        }
        const guidanceChanged = guidanceResults.filter(
          (r) => r.action !== 'skipped' && r.action !== 'error',
        ).length;
        const guidanceUnchanged = guidanceResults.filter((r) => r.action === 'skipped').length;
        const guidanceErrors = guidanceResults.filter((r) => r.action === 'error').length;
        console.log(
          `Global guidance: ${guidanceChanged} updated, ${guidanceUnchanged} unchanged${guidanceErrors ? `, ${guidanceErrors} error(s)` : ''}.`,
        );
      } catch (e) {
        console.log(`Global guidance: skipped (${e instanceof Error ? e.message : String(e)})`);
      }

      try {
        const agentResults = await runAgentSync();
        for (const r of agentResults) {
          const icon = r.action === 'skipped' ? '=' : '+';
          console.log(`  ${icon} [${r.tool}] agent ${r.agent}.${r.format}: ${r.action}`);
        }
        const agentsChanged = agentResults.filter((r) => r.action !== 'skipped').length;
        console.log(`Agents: ${agentsChanged} updated, ${agentResults.length - agentsChanged} unchanged.`);
      } catch (e) {
        console.log(`Agents: skipped (${e instanceof Error ? e.message : String(e)})`);
      }
    });
};
