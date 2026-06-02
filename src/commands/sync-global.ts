import * as fs from 'fs/promises';
import * as path from 'path';
import { backupPath } from '../lib/backup';
import { Config, expandHome } from '../lib/config';

export interface GlobalSyncResult {
  tool: string;
  skill: string;
  action: 'linked' | 'updated' | 'skipped' | 'pruned' | 'error';
  error?: string;
}

/** A target entry is sync-spells-owned iff it is a symlink resolving inside sourceRoot. */
export const isOwnedLink = async (linkPath: string, sourceRoot: string): Promise<boolean> => {
  try {
    const st = await fs.lstat(linkPath);
    if (!st.isSymbolicLink()) {
      return false;
    }
    const target = await fs.readlink(linkPath);
    const resolved = path.resolve(path.dirname(linkPath), target);
    return resolved === sourceRoot || resolved.startsWith(sourceRoot + path.sep);
  } catch {
    return false;
  }
};

export const mergeGlobalSkills = async (
  config: Config,
  toolKey: string,
  targetDir: string,
  desired: { name: string; sourcePath: string }[],
): Promise<GlobalSyncResult[]> => {
  const sourceRoot = expandHome(config.source);
  const results: GlobalSyncResult[] = [];

  // Prepare the target dir: convert a symlink (e.g. a chain) into a real dir; create if missing.
  try {
    const st = await fs.lstat(targetDir);
    if (st.isSymbolicLink()) {
      await backupPath(targetDir);
      await fs.unlink(targetDir);
      await fs.mkdir(targetDir, { recursive: true });
    }
    // a real directory is used as-is
  } catch {
    await fs.mkdir(targetDir, { recursive: true });
  }

  const desiredNames = new Set(desired.map((d) => d.name));

  for (const { name, sourcePath } of desired) {
    const link = path.join(targetDir, name);

    try {
      await fs.access(sourcePath);
    } catch {
      results.push({ tool: toolKey, skill: name, action: 'error', error: `source missing: ${sourcePath}` });
      continue;
    }

    let st: import('fs').Stats | null = null;
    try {
      st = await fs.lstat(link);
    } catch {
      st = null;
    }

    if (!st) {
      await fs.symlink(sourcePath, link);
      results.push({ tool: toolKey, skill: name, action: 'linked' });
    } else if (st.isSymbolicLink()) {
      const current = await fs.readlink(link);
      if (current === sourcePath) {
        results.push({ tool: toolKey, skill: name, action: 'skipped' });
      } else if (await isOwnedLink(link, sourceRoot)) {
        await fs.unlink(link);
        await fs.symlink(sourcePath, link);
        results.push({ tool: toolKey, skill: name, action: 'updated' });
      } else {
        results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign symlink at target name' });
      }
    } else {
      results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign entry at target name' });
    }
  }

  // Prune owned links no longer desired.
  let entries: string[] = [];
  try {
    entries = await fs.readdir(targetDir);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (desiredNames.has(entry)) {
      continue;
    }
    const link = path.join(targetDir, entry);
    if (await isOwnedLink(link, sourceRoot)) {
      await fs.unlink(link);
      results.push({ tool: toolKey, skill: entry, action: 'pruned' });
    }
  }

  return results;
};
