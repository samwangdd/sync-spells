import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import { readConfig, expandHome } from '../lib/config';

interface PushResult {
  copied: number;
  skipped: number;
  skippedFiles: string[];
}

const collectSubDirs = (tools: Record<string, { mappings: { from: string }[] }>): Set<string> => {
  const dirs = new Set<string>();
  for (const tool of Object.values(tools)) {
    for (const mapping of tool.mappings) {
      dirs.add(mapping.from);
    }
  }
  return dirs;
};

export const runPush = async (scanDir: string): Promise<PushResult> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const sourceDir = expandHome(config.source);
  const subDirs = collectSubDirs(config.tools);
  const result: PushResult = { copied: 0, skipped: 0, skippedFiles: [] };

  for (const subDir of subDirs) {
    const srcSubPath = path.join(scanDir, subDir);
    let entries;
    try {
      entries = await fs.readdir(srcSubPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const srcPath = path.join(srcSubPath, entry.name);
      const destPath = path.join(sourceDir, subDir, entry.name);

      try {
        await fs.access(destPath);
        result.skipped++;
        result.skippedFiles.push(path.join(subDir, entry.name));
        continue;
      } catch {
        // File does not exist in source, proceed with copy
      }

      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.cp(srcPath, destPath, { recursive: true });
      result.copied++;
    }
  }

  return result;
};

export const registerPush = (program: Command): void => {
  program
    .command('push [path]')
    .description('Push spell files from a directory into the source')
    .action(async (scanPath?: string) => {
      const dir = scanPath || process.cwd();
      const result = await runPush(dir);
      console.log(`Push complete: ${result.copied} copied, ${result.skipped} skipped.`);
      if (result.skippedFiles.length > 0) {
        console.log('Skipped (already exist):');
        for (const f of result.skippedFiles) {
          console.log(`  - ${f}`);
        }
      }
    });
};
