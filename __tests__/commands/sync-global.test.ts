import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { chmod, lstat, mkdir, readdir, readFile, readlink, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { isBrokenLink, isOwnedLink, mergeGlobalSkills } from '../../src/commands/sync-global';
import { MANIFEST_NAME } from '../../src/lib/copy';

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

describe('isBrokenLink', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-broken-'));
  });

  afterEach(async () => {
    // Some tests strip execute permission on a subdir to trigger a real EACCES; restore it
    // before rmSync, otherwise cleanup itself would fail to traverse into it.
    await chmod(root, 0o755).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  });

  test('true for a dangling symlink (target missing, ENOENT)', async () => {
    const link = path.join(root, 'dangling');
    await symlink(path.join(root, 'nope'), link);
    await expect(isBrokenLink(link)).resolves.toBe(true);
  });

  test('false for a healthy symlink whose target exists', async () => {
    const target = path.join(root, 'real');
    await mkdir(target);
    const link = path.join(root, 'healthy');
    await symlink(target, link);
    await expect(isBrokenLink(link)).resolves.toBe(false);
  });

  test('true when a path segment is not a directory (ENOTDIR)', async () => {
    // `not-a-dir` is a plain file; a target nested "inside" it can't exist — stat() reports
    // ENOTDIR rather than ENOENT, and it must still be treated as a genuinely dangling link.
    const notADir = path.join(root, 'not-a-dir');
    await writeFile(notADir, 'x', 'utf8');
    const link = path.join(root, 'enotdir-case');
    await symlink(path.join(notADir, 'child'), link);
    await expect(isBrokenLink(link)).resolves.toBe(true);
  });

  test('false when the target exists but is inaccessible (EACCES) — not dangling', async () => {
    // Real permission-denied, not a mock: strip search (x) permission on the parent dir so
    // stat() cannot traverse into it, while the target itself genuinely exists.
    const blockedDir = path.join(root, 'blocked');
    const realTarget = path.join(blockedDir, 'target');
    await mkdir(realTarget, { recursive: true });
    await chmod(blockedDir, 0o000);
    const link = path.join(root, 'eacces-case');
    await symlink(realTarget, link);
    try {
      await expect(isBrokenLink(link)).resolves.toBe(false);
    } finally {
      await chmod(blockedDir, 0o755);
    }
  });

  test('false for a symlink loop (ELOOP) — not dangling', async () => {
    // Two symlinks pointing at each other: a genuinely different failure mode from "target
    // missing" and must not be auto-healed the same way a dangling link is.
    const a = path.join(root, 'loop-a');
    const b = path.join(root, 'loop-b');
    await symlink(b, a);
    await symlink(a, b);
    await expect(isBrokenLink(a)).resolves.toBe(false);
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

  test('prunes a dangling link stranded by a renamed registry root', async () => {
    // A link created while the registry lived at a different path. After the rename the target
    // is gone, so it resolves outside the current sourceRoot and isOwnedLink can never claim it —
    // yet it is dead weight and must not survive a sync.
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    await symlink(path.join(home, 'old-registry', 'foundation', 'socratic'), path.join(targetDir, 'socratic'));
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toContainEqual({ tool: 'claude-code', skill: 'socratic', action: 'pruned' });
    await expect(lstat(path.join(targetDir, 'socratic'))).rejects.toThrow();
  });

  test('prunes a recorded link that now points outside the registry but is still alive', async () => {
    // The registry moved and the old location survived (a leftover copy, a still-mounted volume).
    // Such a link is neither owned-by-path nor dangling, so only the manifest can identify it as
    // ours. Without it the entry would sit in the tool's skills dir forever.
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky', 'socratic']));

    const movedRoot = path.join(home, 'moved-registry');
    await mkdir(path.join(movedRoot, 'foundation', 'picky'), { recursive: true });
    const results = await mergeGlobalSkills({ source: movedRoot, tools: {} }, 'claude-code', targetDir, [
      { name: 'picky', sourcePath: path.join(movedRoot, 'foundation', 'picky') },
    ]);

    expect(results).toContainEqual({ tool: 'claude-code', skill: 'socratic', action: 'pruned' });
    await expect(lstat(path.join(targetDir, 'socratic'))).rejects.toThrow();
  });

  test('repoints a recorded link at the new registry instead of reporting it foreign', async () => {
    // The desired-name counterpart of the prune case: after a registry move the old link is alive
    // and outside the new root, so ownership by path fails and it used to be refused as foreign,
    // leaving the tool pointed at the stale registry. The manifest says we wrote it, so heal it.
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));

    const movedRoot = path.join(home, 'moved-registry');
    const movedPicky = path.join(movedRoot, 'foundation', 'picky');
    await mkdir(movedPicky, { recursive: true });
    const results = await mergeGlobalSkills({ source: movedRoot, tools: {} }, 'claude-code', targetDir, [
      { name: 'picky', sourcePath: movedPicky },
    ]);

    expect(results).toContainEqual({ tool: 'claude-code', skill: 'picky', action: 'updated' });
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(movedPicky);
  });

  test('leaves a live foreign link alone even after the registry moves', async () => {
    // Same shape as above — outside the current root, target alive — but never recorded by us.
    // The manifest is what separates the two; a user's own link must survive.
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    const outside = path.join(home, 'outside');
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(targetDir, 'user-link'));

    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));

    expect(results.find((r) => r.skill === 'user-link')).toBeUndefined();
    expect((await lstat(path.join(targetDir, 'user-link'))).isSymbolicLink()).toBe(true);
  });

  test('never treats its own manifest as a skill or prunes it (symlink mode)', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results.find((r) => r.skill === MANIFEST_NAME)).toBeUndefined();
    await expect(lstat(path.join(targetDir, MANIFEST_NAME))).resolves.toBeDefined();
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

  test('reports error and does not touch a foreign symlink occupying a desired name', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    await mkdir(path.join(home, 'outside-target'), { recursive: true });
    await symlink(path.join(home, 'outside-target'), path.join(targetDir, 'picky'));
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toContainEqual(expect.objectContaining({ skill: 'picky', action: 'error' }));
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(path.join(home, 'outside-target'));
  });

  test('heals a dangling symlink at a desired name (e.g. after the registry root was renamed)', async () => {
    // Simulates the real incident: the registry dir was renamed, so a link created under the
    // old root now points at a path that no longer exists anywhere on disk.
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    const deadOldRoot = path.join(home, 'old-registry-root-that-was-renamed');
    await symlink(path.join(deadOldRoot, 'foundation', 'picky'), path.join(targetDir, 'picky'));

    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));

    expect(results).toContainEqual({ tool: 'claude-code', skill: 'picky', action: 'updated' });
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(path.join(sourceRoot, 'foundation', 'picky'));
  });

  test('heals a dangling symlink even when a same-named skill moved category (wrong-target AND broken)', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    // Points inside the current sourceRoot, but at a path that no longer exists (skill moved / deleted).
    await symlink(path.join(sourceRoot, 'old-category', 'picky'), path.join(targetDir, 'picky'));

    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));

    expect(results).toContainEqual({ tool: 'claude-code', skill: 'picky', action: 'updated' });
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(path.join(sourceRoot, 'foundation', 'picky'));
  });

  test('preserves a healthy foreign symlink that is merely inaccessible (EACCES) — reported as error, not replaced', async () => {
    // Real permission-denied (no mocking): the foreign target genuinely exists but its parent
    // dir has search permission stripped, so stat() cannot traverse into it. This must NOT be
    // treated as a dangling link — it's healthy, just temporarily unreadable by this process.
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    const blockedDir = path.join(home, 'blocked-outside-target');
    const realTarget = path.join(blockedDir, 'target');
    await mkdir(realTarget, { recursive: true });
    await chmod(blockedDir, 0o000);
    const foreignLink = path.join(targetDir, 'picky');
    await symlink(realTarget, foreignLink);

    try {
      const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
      expect(results).toContainEqual(expect.objectContaining({ skill: 'picky', action: 'error' }));
      expect(await readlink(foreignLink)).toBe(realTarget);
    } finally {
      await chmod(blockedDir, 0o755);
    }
  });

  test('P2: leaves the original dangling link intact when building its replacement fails', async () => {
    // Real (non-mocked) failure induction: the atomic-replace helper builds the new symlink at
    // a temp SIBLING path (original name + a "~40 char" suffix) before renaming it over the
    // original. A skill name near the filesystem's 255-byte NAME_MAX is valid on its own, but
    // appending that suffix pushes the temp sibling's basename over the limit -> ENAMETOOLONG
    // when creating the temp entry specifically, while the (unsuffixed, shorter) original name
    // stays valid. This isolates exactly "building the replacement failed" without ever having
    // touched the original — the invariant this fix exists to guarantee.
    const longName = 'x'.repeat(230);
    await mkdir(path.join(sourceRoot, 'foundation', longName), { recursive: true });
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    const deadOldRoot = path.join(home, 'old-registry-root-that-was-renamed');
    const originalTarget = path.join(deadOldRoot, 'foundation', longName);
    const link = path.join(targetDir, longName);
    await symlink(originalTarget, link);

    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor([longName]));

    expect(results).toContainEqual(expect.objectContaining({ skill: longName, action: 'error' }));
    // The original dangling link must still be there, byte-for-byte as it was — never removed.
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(originalTarget);
    // No leftover temp entries in the target dir.
    const entries = await readdir(targetDir);
    expect(entries.filter((e: string) => e.includes('.sync-spells-tmp-'))).toEqual([]);
  });
});

describe('mergeGlobalSkills (copy mode)', () => {
  let home: string;
  let sourceRoot: string;
  let targetDir: string;

  const desiredFor = (names: string[]) =>
    names.map((n) => ({ name: n, sourcePath: path.join(sourceRoot, 'foundation', n) }));

  const cfg = () => ({ source: sourceRoot, tools: {} });

  const merge = (names: string[]) =>
    mergeGlobalSkills(cfg(), 'kiro', targetDir, desiredFor(names), 'copy');

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-copy-merge-'));
    sourceRoot = path.join(home, 'skill-category');
    targetDir = path.join(home, 'kiro', 'skills');
    for (const n of ['picky', 'evolution']) {
      const dir = path.join(sourceRoot, 'foundation', n);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), `# ${n}`, 'utf8');
    }
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('copies desired skills as real directories and records a manifest', async () => {
    const results = await merge(['picky', 'evolution']);

    expect(results.filter((r) => r.action === 'linked').map((r) => r.skill).sort()).toEqual(['evolution', 'picky']);
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(targetDir, 'picky', 'SKILL.md'), 'utf8')).toBe('# picky');

    const manifest = JSON.parse(await readFile(path.join(targetDir, MANIFEST_NAME), 'utf8'));
    expect(Object.keys(manifest.entries).sort()).toEqual(['evolution', 'picky']);
  });

  test('is idempotent — unchanged source reports skipped', async () => {
    await merge(['picky']);
    const results = await merge(['picky']);
    expect(results).toEqual([{ tool: 'kiro', skill: 'picky', action: 'skipped' }]);
  });

  test('re-copies when the source content changes (updated)', async () => {
    await merge(['picky']);
    await writeFile(path.join(sourceRoot, 'foundation', 'picky', 'SKILL.md'), '# picky v2', 'utf8');
    const results = await merge(['picky']);
    expect(results).toContainEqual({ tool: 'kiro', skill: 'picky', action: 'updated' });
    expect(await readFile(path.join(targetDir, 'picky', 'SKILL.md'), 'utf8')).toBe('# picky v2');
  });

  test('prunes owned copies no longer in the desired set', async () => {
    await merge(['picky', 'evolution']);
    const results = await merge(['picky']);
    expect(results).toContainEqual({ tool: 'kiro', skill: 'evolution', action: 'pruned' });
    await expect(lstat(path.join(targetDir, 'evolution'))).rejects.toThrow();
    const manifest = JSON.parse(await readFile(path.join(targetDir, MANIFEST_NAME), 'utf8'));
    expect(Object.keys(manifest.entries)).toEqual(['picky']);
  });

  test('never treats the manifest file itself as a skill or prunes it', async () => {
    await merge(['picky']);
    const results = await merge(['picky']);
    expect(results.find((r) => r.skill === MANIFEST_NAME)).toBeUndefined();
    await expect(lstat(path.join(targetDir, MANIFEST_NAME))).resolves.toBeDefined();
  });

  test('reports error and leaves a foreign real entry untouched', async () => {
    await mkdir(path.join(targetDir, 'picky'), { recursive: true });
    await writeFile(path.join(targetDir, 'picky', 'SKILL.md'), 'mine', 'utf8');
    const results = await merge(['picky']);
    expect(results).toContainEqual(expect.objectContaining({ skill: 'picky', action: 'error' }));
    expect(await readFile(path.join(targetDir, 'picky', 'SKILL.md'), 'utf8')).toBe('mine');
  });

  test('preserves foreign files during prune', async () => {
    await merge(['picky']);
    await writeFile(path.join(targetDir, 'user-note.md'), 'mine', 'utf8');
    await merge(['picky']);
    expect(await readFile(path.join(targetDir, 'user-note.md'), 'utf8')).toBe('mine');
  });

  test('migrates an owned symlink left by symlink mode into a real copy (updated)', async () => {
    await mkdir(targetDir, { recursive: true });
    await symlink(path.join(sourceRoot, 'foundation', 'picky'), path.join(targetDir, 'picky'));
    const results = await merge(['picky']);
    expect(results).toContainEqual({ tool: 'kiro', skill: 'picky', action: 'updated' });
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(targetDir, 'picky', 'SKILL.md'), 'utf8')).toBe('# picky');
  });

  test('prunes stale owned symlinks not in the desired set', async () => {
    await mkdir(targetDir, { recursive: true });
    await symlink(path.join(sourceRoot, 'foundation', 'evolution'), path.join(targetDir, 'evolution'));
    const results = await merge(['picky']);
    expect(results).toContainEqual({ tool: 'kiro', skill: 'evolution', action: 'pruned' });
    await expect(lstat(path.join(targetDir, 'evolution'))).rejects.toThrow();
  });

  test('heals a dangling symlink left in the target dir (e.g. after the registry root was renamed)', async () => {
    await mkdir(targetDir, { recursive: true });
    const deadOldRoot = path.join(home, 'old-registry-root-that-was-renamed');
    await symlink(path.join(deadOldRoot, 'foundation', 'picky'), path.join(targetDir, 'picky'));

    const results = await merge(['picky']);

    expect(results).toContainEqual({ tool: 'kiro', skill: 'picky', action: 'updated' });
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(targetDir, 'picky', 'SKILL.md'), 'utf8')).toBe('# picky');
  });

  test('reports error and does not touch a foreign symlink occupying a desired name', async () => {
    await mkdir(targetDir, { recursive: true });
    await mkdir(path.join(home, 'outside-target'), { recursive: true });
    await symlink(path.join(home, 'outside-target'), path.join(targetDir, 'picky'));
    const results = await merge(['picky']);
    expect(results).toContainEqual(expect.objectContaining({ skill: 'picky', action: 'error' }));
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(path.join(home, 'outside-target'));
  });

  test('P2: leaves the existing directory intact when building its replacement copy fails', async () => {
    // Same real, deterministic NAME_MAX induction as the symlink-mode P2 test: a skill name near
    // 255 bytes is valid on its own, but the atomic-replace helper's temp-sibling suffix pushes
    // it over the limit, so building the replacement fails before the existing directory is ever
    // touched. This exercises the case P2 explicitly called out: copy-mode's target can be a
    // real, non-empty directory (not just a leftover symlink).
    const longName = 'y'.repeat(230);
    const srcDir = path.join(sourceRoot, 'foundation', longName);
    await mkdir(srcDir, { recursive: true });
    await writeFile(path.join(srcDir, 'SKILL.md'), '# new content', 'utf8');

    await mkdir(targetDir, { recursive: true });
    const destDir = path.join(targetDir, longName);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, 'SKILL.md'), '# OLD CONTENT', 'utf8');
    // Seed a manifest with a hash that won't match the (new) source content, forcing the
    // "changed -> re-copy" branch rather than "skipped".
    await writeFile(
      path.join(targetDir, MANIFEST_NAME),
      JSON.stringify({ version: 1, entries: { [longName]: { hash: 'stale-hash-does-not-match-current-source' } } }),
      'utf8',
    );

    const results = await merge([longName]);

    expect(results).toContainEqual(expect.objectContaining({ skill: longName, action: 'error' }));
    // The original directory must still be there, completely unchanged — never lost.
    expect(await readFile(path.join(destDir, 'SKILL.md'), 'utf8')).toBe('# OLD CONTENT');
    const entries = await readdir(targetDir);
    expect(entries.filter((e) => e.includes('.sync-spells-tmp-'))).toEqual([]);
    expect(entries.filter((e) => e.endsWith('.bak'))).toEqual([]);
  });

  test('copies dereference symlinks inside a skill (no links reach the target)', async () => {
    const shared = path.join(sourceRoot, 'shared.md');
    await writeFile(shared, 'shared', 'utf8');
    await symlink(shared, path.join(sourceRoot, 'foundation', 'picky', 'shared.md'));
    await merge(['picky']);
    const st = await lstat(path.join(targetDir, 'picky', 'shared.md'));
    expect(st.isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(targetDir, 'picky', 'shared.md'), 'utf8')).toBe('shared');
  });

  test('reports error when a desired skill source path is missing', async () => {
    const results = await merge(['ghost']);
    expect(results).toContainEqual(expect.objectContaining({ skill: 'ghost', action: 'error' }));
  });
});

const loadGlobalModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({ ...actualOs, homedir: () => homeDir }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/sync-global') as typeof import('../../src/commands/sync-global');
};

describe('runGlobalSync', () => {
  let home: string;
  let workspace: string;
  let sourceRoot: string;

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-gsync-home-'));
    workspace = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-gsync-ws-'));
    sourceRoot = path.join(workspace, 'skill-category');
    for (const n of ['picky', 'evolution']) {
      await mkdir(path.join(sourceRoot, 'foundation', n), { recursive: true });
    }
    await mkdir(path.join(workspace, 'profiles'), { recursive: true });
    await writeFile(
      path.join(workspace, 'profiles', 'global.json'),
      JSON.stringify({ name: 'global', extras: ['foundation/picky', 'foundation/evolution'] }),
      'utf8',
    );
  });

  afterEach(() => {
    jest.dontMock('os');
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  const writeCfg = (tools: Record<string, unknown>) => {
    const dir = path.join(home, '.sync-spells');
    require('fs').mkdirSync(dir, { recursive: true });
    require('fs').writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ source: sourceRoot, profilesDir: path.join(workspace, 'profiles'), tools }),
      'utf8',
    );
  };

  test('resolves the global profile and merges its skills into from:global tools', async () => {
    const claudeSkills = path.join(home, '.claude', 'skills');
    writeCfg({
      'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [{ from: 'global', to: 'skills' }] },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    const results = await runGlobalSync();
    expect((await lstat(path.join(claudeSkills, 'picky'))).isSymbolicLink()).toBe(true);
    expect((await lstat(path.join(claudeSkills, 'evolution'))).isSymbolicLink()).toBe(true);
    expect(results.filter((r) => r.action === 'linked').length).toBe(2);
  });

  test('honors syncMode copy — kiro gets real directories, not symlinks', async () => {
    const kiroSkills = path.join(home, '.kiro', 'skills');
    writeCfg({
      kiro: { enabled: true, configPath: path.join(home, '.kiro'), mappings: [{ from: 'global', to: 'skills' }], syncMode: 'copy' },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    const results = await runGlobalSync();
    expect((await lstat(path.join(kiroSkills, 'picky'))).isSymbolicLink()).toBe(false);
    expect((await lstat(path.join(kiroSkills, 'evolution'))).isSymbolicLink()).toBe(false);
    expect(results.filter((r) => r.action === 'linked').length).toBe(2);
  });

  test('ignores tools without a from:global mapping', async () => {
    writeCfg({
      'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [{ from: 'commands', to: 'commands' }] },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    expect(await runGlobalSync()).toEqual([]);
  });

  test('throws a clear error when the global profile is missing', async () => {
    rmSync(path.join(workspace, 'profiles', 'global.json'));
    writeCfg({
      'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [{ from: 'global', to: 'skills' }] },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    await expect(runGlobalSync()).rejects.toThrow(/global/i);
  });

  test('skips disabled tools', async () => {
    writeCfg({
      'claude-code': { enabled: false, configPath: path.join(home, '.claude'), mappings: [{ from: 'global', to: 'skills' }] },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    expect(await runGlobalSync()).toEqual([]);
  });

  test('throws when no source is configured', async () => {
    const dir = path.join(home, '.sync-spells');
    require('fs').mkdirSync(dir, { recursive: true });
    require('fs').writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ source: '', tools: {} }), 'utf8');
    const { runGlobalSync } = loadGlobalModule(home);
    await expect(runGlobalSync()).rejects.toThrow('No source configured');
  });
});
