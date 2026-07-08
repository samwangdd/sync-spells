import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import * as path from 'path';
import { backupPath } from '../lib/backup';
import { Config, SyncMode, expandHome, readConfig } from '../lib/config';
import { MANIFEST_NAME, copyTree, hashTree, readCopyManifest, writeCopyManifest } from '../lib/copy';
import { ProfileService } from '../services/ProfileService';
import { ResolveService } from '../services/ResolveService';
import { SkillService } from '../services/SkillService';

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

/** Copy-mode merge for tools that cannot follow symlinks (e.g. Kiro). Ownership and
 * freshness come from a manifest in the target dir instead of readlink. */
const mergeCopiedSkills = async (
  sourceRoot: string,
  toolKey: string,
  targetDir: string,
  desired: { name: string; sourcePath: string }[],
): Promise<GlobalSyncResult[]> => {
  const results: GlobalSyncResult[] = [];
  const manifest = await readCopyManifest(targetDir);
  const desiredNames = new Set(desired.map((d) => d.name));

  for (const { name, sourcePath } of desired) {
    const dest = path.join(targetDir, name);

    try {
      await fs.access(sourcePath);
    } catch {
      results.push({ tool: toolKey, skill: name, action: 'error', error: `source missing: ${sourcePath}` });
      continue;
    }

    const hash = await hashTree(sourcePath);

    let st: Stats | null = null;
    try {
      st = await fs.lstat(dest);
    } catch {
      st = null;
    }

    if (!st) {
      await copyTree(sourcePath, dest);
      manifest.entries[name] = { hash };
      results.push({ tool: toolKey, skill: name, action: 'linked' });
    } else if (st.isSymbolicLink()) {
      if (await isOwnedLink(dest, sourceRoot)) {
        // leftover from symlink mode — replace the link with a real copy
        await fs.unlink(dest);
        await copyTree(sourcePath, dest);
        manifest.entries[name] = { hash };
        results.push({ tool: toolKey, skill: name, action: 'updated' });
      } else {
        results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign symlink at target name' });
      }
    } else if (manifest.entries[name]) {
      if (manifest.entries[name].hash === hash) {
        results.push({ tool: toolKey, skill: name, action: 'skipped' });
      } else {
        await fs.rm(dest, { recursive: true, force: true });
        await copyTree(sourcePath, dest);
        manifest.entries[name] = { hash };
        results.push({ tool: toolKey, skill: name, action: 'updated' });
      }
    } else {
      results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign entry at target name' });
    }
  }

  // Prune entries we own (manifest copies or stale owned symlinks) that are no longer desired.
  let entries: string[] = [];
  try {
    entries = await fs.readdir(targetDir);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (entry === MANIFEST_NAME || desiredNames.has(entry)) {
      continue;
    }
    const entryPath = path.join(targetDir, entry);
    if (manifest.entries[entry]) {
      await fs.rm(entryPath, { recursive: true, force: true });
      delete manifest.entries[entry];
      results.push({ tool: toolKey, skill: entry, action: 'pruned' });
    } else if (await isOwnedLink(entryPath, sourceRoot)) {
      await fs.unlink(entryPath);
      results.push({ tool: toolKey, skill: entry, action: 'pruned' });
    }
  }

  // Drop manifest entries that no longer exist on disk and are not desired.
  for (const name of Object.keys(manifest.entries)) {
    if (!desiredNames.has(name)) {
      delete manifest.entries[name];
    }
  }

  await writeCopyManifest(targetDir, manifest);
  return results;
};

export const mergeGlobalSkills = async (
  config: Config,
  toolKey: string,
  targetDir: string,
  desired: { name: string; sourcePath: string }[],
  syncMode: SyncMode = 'symlink',
): Promise<GlobalSyncResult[]> => {
  const sourceRoot = expandHome(config.source);
  const results: GlobalSyncResult[] = [];

  // Prepare the target dir: convert a symlink (e.g. a chain) into a real dir; create if missing.
  try {
    const st = await fs.lstat(targetDir);
    if (st.isSymbolicLink()) {
      // Note: backupPath copies the symlink itself (not a deep copy of its target),
      // and unlink removes only the link entry — the chained real directory is unharmed.
      await backupPath(targetDir);
      await fs.unlink(targetDir);
      await fs.mkdir(targetDir, { recursive: true });
    }
    // a real directory is used as-is
  } catch {
    await fs.mkdir(targetDir, { recursive: true });
  }

  if (syncMode === 'copy') {
    return mergeCopiedSkills(sourceRoot, toolKey, targetDir, desired);
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

    let st: Stats | null = null;
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

export const runGlobalSync = async (): Promise<GlobalSyncResult[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const resolved = await new ResolveService(
    config,
    new ProfileService(config),
    new SkillService(config),
  ).resolve('global');

  const sourceRoot = expandHome(config.source);
  const desired = resolved.skills.map((skillPath) => ({
    name: path.basename(skillPath),
    sourcePath: path.join(sourceRoot, skillPath),
  }));

  const results: GlobalSyncResult[] = [];
  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }
    for (const mapping of toolConfig.mappings) {
      if (mapping.from !== 'global') {
        continue;
      }
      const targetDir = path.join(expandHome(toolConfig.configPath), mapping.to);
      results.push(...(await mergeGlobalSkills(config, toolKey, targetDir, desired, toolConfig.syncMode ?? 'symlink')));
    }
  }
  return results;
};
