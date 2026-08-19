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

/** True when linkPath is a symlink whose target no longer exists (dangling). Assumes the
 * caller has already confirmed linkPath is a symlink (e.g. via lstat().isSymbolicLink()). A
 * dangling link is dead weight regardless of where it used to point — e.g. after the registry
 * root is renamed, links created under the old root become dangling and must be healed rather
 * than skipped or reported as "foreign".
 *
 * Only ENOENT/ENOTDIR (the target path genuinely does not exist) count as "dangling". Any other
 * stat failure — EACCES (a parent dir's search permission was pulled), ELOOP (a symlink cycle),
 * etc. — means the link may well be healthy, just not traversable right now; auto-replacing it
 * would delete a working foreign symlink. Those cases fall through to the existing "foreign
 * symlink at target name" error instead. */
export const isBrokenLink = async (linkPath: string): Promise<boolean> => {
  try {
    await fs.stat(linkPath); // follows the symlink; throws if the target is missing
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
  }
};

/** True when the entry is a symlink whose target no longer exists. Unlike `isBrokenLink`, this
 * confirms the entry really is a symlink first, so it is safe to call on an arbitrary directory
 * entry — a plain file or real directory answers false rather than being judged by stat alone.
 *
 * Prune uses this to reclaim links `isOwnedLink` can never claim: once the registry root is
 * renamed, links written under the old root resolve outside the current sourceRoot, so ownership
 * by path is unanswerable. A dangling link in a tool's skills dir is dead weight either way. */
export const isDanglingSymlink = async (entryPath: string): Promise<boolean> => {
  try {
    const st = await fs.lstat(entryPath);
    if (!st.isSymbolicLink()) {
      return false;
    }
  } catch {
    return false;
  }
  return isBrokenLink(entryPath);
};

/** A same-directory sibling path to build a replacement at before swapping it into place.
 * Same directory guarantees the eventual `rename` is on the same filesystem (required for
 * `rename` to be atomic rather than falling back to a copy). */
const tempSiblingPath = (target: string): string =>
  `${target}.sync-spells-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Atomically replace the symlink at `link` (which must already exist) so it points to
 * `sourcePath`, without ever leaving `link` absent. Builds the new symlink at a temp sibling
 * path first and only then `rename`s it over `link` — `rename` atomically replaces an existing
 * symlink in a single syscall, so a failure while creating the temp symlink (the only step that
 * can realistically fail here) leaves the original `link` completely untouched instead of
 * unlinking it before the replacement is known to exist. */
const replaceSymlinkAtomically = async (sourcePath: string, link: string): Promise<void> => {
  const tmp = tempSiblingPath(link);
  try {
    await fs.symlink(sourcePath, tmp);
    await fs.rename(tmp, link);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
};

/** Atomically replace whatever currently exists at `dest` (a leftover symlink, or a real,
 * possibly non-empty directory) with a fresh copy of `sourcePath`. Builds the copy at a temp
 * sibling first (a failure here — e.g. an unreadable source file, or a name too long — never
 * touches `dest`). Only then does it move the existing entry aside to a backup sibling and swap
 * the new copy into place, restoring the backup if that final swap fails for any reason — `dest`
 * is never left absent-and-unrecoverable. */
const replaceWithCopyAtomically = async (sourcePath: string, dest: string): Promise<void> => {
  const tmp = tempSiblingPath(dest);
  try {
    await copyTree(sourcePath, tmp);
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }

  const backup = `${tmp}.bak`;
  await fs.rename(dest, backup);
  try {
    await fs.rename(tmp, dest);
  } catch (err) {
    await fs.rename(backup, dest).catch(() => undefined);
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
  await fs.rm(backup, { recursive: true, force: true });
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
      if (await isOwnedLink(dest, sourceRoot) || await isBrokenLink(dest)) {
        // leftover from symlink mode (or a dangling link from before a registry rename) —
        // replace it with a real copy
        try {
          await replaceWithCopyAtomically(sourcePath, dest);
          manifest.entries[name] = { hash };
          results.push({ tool: toolKey, skill: name, action: 'updated' });
        } catch (err) {
          results.push({ tool: toolKey, skill: name, action: 'error', error: `heal failed, original preserved: ${err}` });
        }
      } else {
        results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign symlink at target name' });
      }
    } else if (manifest.entries[name]) {
      if (manifest.entries[name].hash === hash) {
        results.push({ tool: toolKey, skill: name, action: 'skipped' });
      } else {
        try {
          await replaceWithCopyAtomically(sourcePath, dest);
          manifest.entries[name] = { hash };
          results.push({ tool: toolKey, skill: name, action: 'updated' });
        } catch (err) {
          results.push({ tool: toolKey, skill: name, action: 'error', error: `re-copy failed, original preserved: ${err}` });
        }
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
      } else if (await isOwnedLink(link, sourceRoot) || await isBrokenLink(link)) {
        // Owned (points inside the current sourceRoot) OR dangling (e.g. a leftover link from
        // before the registry root was renamed) — either way it's safe and desired to heal.
        try {
          await replaceSymlinkAtomically(sourcePath, link);
          results.push({ tool: toolKey, skill: name, action: 'updated' });
        } catch (err) {
          results.push({ tool: toolKey, skill: name, action: 'error', error: `heal failed, original preserved: ${err}` });
        }
      } else {
        results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign symlink at target name' });
      }
    } else {
      results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign entry at target name' });
    }
  }

  // Prune links no longer desired.
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
    if ((await isOwnedLink(link, sourceRoot)) || (await isDanglingSymlink(link))) {
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
