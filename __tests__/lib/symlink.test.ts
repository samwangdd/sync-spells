import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as fs from 'fs';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const loadSymlinkModule = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/lib/symlink') as typeof import('../../src/lib/symlink');
};

describe('symlink utilities', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-symlink-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  test('checkSymlinkState returns missing for absent path', async () => {
    const { checkSymlinkState } = loadSymlinkModule();

    await expect(checkSymlinkState(path.join(tempHome, 'missing'), '/target')).resolves.toBe('missing');
  });

  test('checkSymlinkState returns linked for a symlink to the expected target', async () => {
    const { checkSymlinkState, createSymlink } = loadSymlinkModule();
    const targetFile = path.join(tempHome, 'target.txt');
    const linkPath = path.join(tempHome, 'link.txt');

    writeFileSync(targetFile, 'ok', 'utf8');
    await createSymlink(targetFile, linkPath);

    await expect(checkSymlinkState(linkPath, targetFile)).resolves.toBe('linked');
  });

  test('checkSymlinkState returns linked for a relative symlink target', async () => {
    const { checkSymlinkState, createSymlink } = loadSymlinkModule();
    const targetFile = path.join(tempHome, 'relative-target.txt');
    const linkPath = path.join(tempHome, 'relative-link.txt');
    const relativeTarget = 'relative-target.txt';

    writeFileSync(targetFile, 'ok', 'utf8');
    await createSymlink(relativeTarget, linkPath);

    await expect(checkSymlinkState(linkPath, relativeTarget)).resolves.toBe('linked');
  });

  test('checkSymlinkState returns broken for a symlink to a missing target', async () => {
    const { checkSymlinkState, createSymlink } = loadSymlinkModule();
    const targetFile = path.join(tempHome, 'missing-target.txt');
    const linkPath = path.join(tempHome, 'broken-link.txt');

    await createSymlink(targetFile, linkPath);

    await expect(checkSymlinkState(linkPath, targetFile)).resolves.toBe('broken');
  });

  test('checkSymlinkState returns real-dir for a real directory', async () => {
    const { checkSymlinkState } = loadSymlinkModule();
    const dirPath = path.join(tempHome, 'real-dir');
    fs.mkdirSync(dirPath);

    await expect(checkSymlinkState(dirPath, '/target')).resolves.toBe('real-dir');
  });

  test('checkSymlinkState returns wrong-target for a symlink to another target', async () => {
    const { checkSymlinkState, createSymlink } = loadSymlinkModule();
    const targetFile = path.join(tempHome, 'target.txt');
    const otherTargetFile = path.join(tempHome, 'other-target.txt');
    const linkPath = path.join(tempHome, 'wrong-link.txt');

    writeFileSync(targetFile, 'a', 'utf8');
    writeFileSync(otherTargetFile, 'b', 'utf8');
    await createSymlink(otherTargetFile, linkPath);

    await expect(checkSymlinkState(linkPath, targetFile)).resolves.toBe('wrong-target');
  });

  test('createSymlink creates a symlink and removeSymlink removes it', async () => {
    const { checkSymlinkState, createSymlink, removeSymlink } = loadSymlinkModule();
    const targetFile = path.join(tempHome, 'managed-target.txt');
    const linkPath = path.join(tempHome, 'managed-link.txt');

    writeFileSync(targetFile, 'content', 'utf8');
    await createSymlink(targetFile, linkPath);
    await expect(checkSymlinkState(linkPath, targetFile)).resolves.toBe('linked');

    await removeSymlink(linkPath);
    await expect(checkSymlinkState(linkPath, targetFile)).resolves.toBe('missing');
  });
});
