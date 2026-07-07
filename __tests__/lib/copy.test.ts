import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { lstat, mkdir, readFile, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  MANIFEST_NAME,
  copyTree,
  hashTree,
  readCopyManifest,
  writeCopyManifest,
} from '../../src/lib/copy';

describe('hashTree', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-hash-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const makeSkill = async (name: string, files: Record<string, string>) => {
    const dir = path.join(root, name);
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await writeFile(path.join(dir, rel), content, 'utf8');
    }
    return dir;
  };

  test('identical trees hash identically', async () => {
    const a = await makeSkill('a', { 'SKILL.md': '# hi', 'ref/notes.md': 'n' });
    const b = await makeSkill('b', { 'SKILL.md': '# hi', 'ref/notes.md': 'n' });
    expect(await hashTree(a)).toBe(await hashTree(b));
  });

  test('content change changes the hash', async () => {
    const a = await makeSkill('a', { 'SKILL.md': '# hi' });
    const before = await hashTree(a);
    await writeFile(path.join(a, 'SKILL.md'), '# changed', 'utf8');
    expect(await hashTree(a)).not.toBe(before);
  });

  test('file rename changes the hash', async () => {
    const a = await makeSkill('a', { 'SKILL.md': '# hi' });
    const b = await makeSkill('b', { 'OTHER.md': '# hi' });
    expect(await hashTree(a)).not.toBe(await hashTree(b));
  });

  test('follows symlinks so linked content hashes by value', async () => {
    const real = await makeSkill('real', { 'SKILL.md': '# hi' });
    const linked = path.join(root, 'linked');
    await mkdir(linked, { recursive: true });
    await symlink(path.join(real, 'SKILL.md'), path.join(linked, 'SKILL.md'));
    expect(await hashTree(linked)).toBe(await hashTree(real));
  });
});

describe('copyTree', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-copy-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('copies a nested tree', async () => {
    const src = path.join(root, 'src');
    await mkdir(path.join(src, 'ref'), { recursive: true });
    await writeFile(path.join(src, 'SKILL.md'), '# hi', 'utf8');
    await writeFile(path.join(src, 'ref', 'notes.md'), 'n', 'utf8');

    const dest = path.join(root, 'dest');
    await copyTree(src, dest);

    expect(await readFile(path.join(dest, 'SKILL.md'), 'utf8')).toBe('# hi');
    expect(await readFile(path.join(dest, 'ref', 'notes.md'), 'utf8')).toBe('n');
  });

  test('dereferences symlinks — the copy contains no links', async () => {
    const real = path.join(root, 'real');
    await mkdir(real, { recursive: true });
    await writeFile(path.join(real, 'SKILL.md'), '# hi', 'utf8');

    const src = path.join(root, 'src');
    await mkdir(src, { recursive: true });
    await symlink(path.join(real, 'SKILL.md'), path.join(src, 'SKILL.md'));

    const dest = path.join(root, 'dest');
    await copyTree(src, dest);

    const st = await lstat(path.join(dest, 'SKILL.md'));
    expect(st.isSymbolicLink()).toBe(false);
    expect(await readFile(path.join(dest, 'SKILL.md'), 'utf8')).toBe('# hi');
  });
});

describe('copy manifest', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-manifest-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('missing manifest reads as empty', async () => {
    await expect(readCopyManifest(dir)).resolves.toEqual({ version: 1, entries: {} });
  });

  test('invalid manifest reads as empty', async () => {
    await writeFile(path.join(dir, MANIFEST_NAME), 'not json', 'utf8');
    await expect(readCopyManifest(dir)).resolves.toEqual({ version: 1, entries: {} });
  });

  test('write then read round-trips', async () => {
    const manifest = { version: 1 as const, entries: { picky: { hash: 'abc' } } };
    await writeCopyManifest(dir, manifest);
    await expect(readCopyManifest(dir)).resolves.toEqual(manifest);
  });
});
