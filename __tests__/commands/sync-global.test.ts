import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { mkdir, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { isOwnedLink } from '../../src/commands/sync-global';

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
