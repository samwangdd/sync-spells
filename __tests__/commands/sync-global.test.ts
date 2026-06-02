import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { lstat, mkdir, readFile, readlink, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { isOwnedLink, mergeGlobalSkills } from '../../src/commands/sync-global';

describe('isOwnedLink', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-owned-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('true for a symlink resolving inside sourceRoot', async () => {
    const sourceRoot = path.join(root, 'skill-category');
    await mkdir(path.join(sourceRoot, 'foundation', 'picky'), { recursive: true });
    const link = path.join(root, 'picky');
    await symlink(path.join(sourceRoot, 'foundation', 'picky'), link);
    await expect(isOwnedLink(link, sourceRoot)).resolves.toBe(true);
  });

  test('false for a symlink pointing outside sourceRoot', async () => {
    const sourceRoot = path.join(root, 'skill-category');
    await mkdir(path.join(root, 'elsewhere'), { recursive: true });
    const link = path.join(root, 'x');
    await symlink(path.join(root, 'elsewhere'), link);
    await expect(isOwnedLink(link, sourceRoot)).resolves.toBe(false);
  });

  test('false for a real file', async () => {
    const sourceRoot = path.join(root, 'skill-category');
    const f = path.join(root, 'real.txt');
    await writeFile(f, 'x', 'utf8');
    await expect(isOwnedLink(f, sourceRoot)).resolves.toBe(false);
  });

  test('false for a missing path', async () => {
    await expect(isOwnedLink(path.join(root, 'nope'), path.join(root, 'skill-category'))).resolves.toBe(false);
  });
});

describe('mergeGlobalSkills', () => {
  let home: string;
  let sourceRoot: string;

  const desiredFor = (names: string[]) =>
    names.map((n) => ({ name: n, sourcePath: path.join(sourceRoot, 'foundation', n) }));

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-merge-'));
    sourceRoot = path.join(home, 'skill-category');
    for (const n of ['picky', 'evolution', 'socratic']) {
      await mkdir(path.join(sourceRoot, 'foundation', n), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const cfg = () => ({ source: sourceRoot, tools: {} });

  test('links desired skills into a fresh (missing) target dir', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky', 'evolution']));
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(true);
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(path.join(sourceRoot, 'foundation', 'picky'));
    expect(results.filter((r) => r.action === 'linked').map((r) => r.skill).sort()).toEqual(['evolution', 'picky']);
  });

  test('is idempotent — second run reports skipped, no changes', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toEqual([{ tool: 'claude-code', skill: 'picky', action: 'skipped' }]);
  });

  test('preserves foreign files and foreign symlinks (own-only)', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, 'user-note.md'), 'mine', 'utf8');
    await mkdir(path.join(home, 'outside'), { recursive: true });
    await symlink(path.join(home, 'outside'), path.join(targetDir, 'foreign-link'));
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(await readFile(path.join(targetDir, 'user-note.md'), 'utf8')).toBe('mine');
    expect((await lstat(path.join(targetDir, 'foreign-link'))).isSymbolicLink()).toBe(true);
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(true);
  });

  test('prunes owned links no longer in the desired set', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky', 'evolution']));
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toContainEqual({ tool: 'claude-code', skill: 'evolution', action: 'pruned' });
    await expect(lstat(path.join(targetDir, 'evolution'))).rejects.toThrow();
  });

  test('converts a chain symlink target dir into a real dir (backs up first)', async () => {
    const realClaude = path.join(home, 'claude', 'skills');
    await mkdir(realClaude, { recursive: true });
    const targetDir = path.join(home, 'agents', 'skills');
    await mkdir(path.dirname(targetDir), { recursive: true });
    await symlink(realClaude, targetDir);
    await mergeGlobalSkills(cfg(), 'agents', targetDir, desiredFor(['picky']));
    expect((await lstat(targetDir)).isSymbolicLink()).toBe(false);
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(true);
  });

  test('reports error (does not overwrite) when a foreign real file occupies a desired name', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, 'picky'), 'foreign', 'utf8');
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toContainEqual(
      expect.objectContaining({ tool: 'claude-code', skill: 'picky', action: 'error' }),
    );
    expect(await readFile(path.join(targetDir, 'picky'), 'utf8')).toBe('foreign');
  });

  test('reports error when a desired skill source path is missing', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, [
      { name: 'ghost', sourcePath: path.join(sourceRoot, 'foundation', 'ghost') },
    ]);
    expect(results).toContainEqual(
      expect.objectContaining({ skill: 'ghost', action: 'error' }),
    );
  });

  test('re-points an owned link whose target changed (updated)', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    const altSource = path.join(sourceRoot, 'foundation', 'picky-v2');
    await mkdir(altSource, { recursive: true });
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, [
      { name: 'picky', sourcePath: altSource },
    ]);
    expect(results).toContainEqual({ tool: 'claude-code', skill: 'picky', action: 'updated' });
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(altSource);
  });
});
