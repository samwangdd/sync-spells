import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const loadBackupModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/lib/backup') as typeof import('../../src/lib/backup');
};

describe('backup utility', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-04-04T03:04:05.000Z'));
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-backup-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.HOME = originalHome;
    jest.dontMock('os');
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('backupPath copies a file to the backup location and returns the backup path', async () => {
    const { backupPath } = loadBackupModule(tempHome);
    const sourceFile = path.join(tempHome, 'sample.txt');
    writeFileSync(sourceFile, 'file-content', 'utf8');

    const backedUpFile = await backupPath(sourceFile);

    expect(backedUpFile).toBe(
      path.join(tempHome, '.sync-spells', 'backups', '2026-04-04T03-04-05', 'sample.txt'),
    );
    expect(readFileSync(backedUpFile, 'utf8')).toBe('file-content');
  });

  test('backupPath copies a directory to the backup location and returns the backup path', async () => {
    const { backupPath } = loadBackupModule(tempHome);
    const sourceDir = path.join(tempHome, 'sample-dir');
    const nestedFile = path.join(sourceDir, 'nested.txt');
    const nestedDir = path.join(sourceDir, 'inner');
    const nestedInnerFile = path.join(nestedDir, 'deep.txt');

    rmSync(sourceDir, { recursive: true, force: true });
    require('fs').mkdirSync(nestedDir, { recursive: true });
    writeFileSync(nestedFile, 'dir-content', 'utf8');
    writeFileSync(nestedInnerFile, 'deep-content', 'utf8');

    const backedUpDir = await backupPath(sourceDir);

    expect(backedUpDir).toBe(
      path.join(tempHome, '.sync-spells', 'backups', '2026-04-04T03-04-05', 'sample-dir'),
    );
    expect(readFileSync(path.join(backedUpDir, 'nested.txt'), 'utf8')).toBe('dir-content');
    expect(readFileSync(path.join(backedUpDir, 'inner', 'deep.txt'), 'utf8')).toBe('deep-content');
  });

  test('backupPath places backups under ~/.sync-spells/backups', async () => {
    const { backupPath } = loadBackupModule(tempHome);
    const sourceFile = path.join(tempHome, 'location-check.txt');
    writeFileSync(sourceFile, 'x', 'utf8');

    const backedUpFile = await backupPath(sourceFile);

    expect(backedUpFile.startsWith(path.join(tempHome, '.sync-spells', 'backups'))).toBe(true);
    expect(existsSync(backedUpFile)).toBe(true);
  });

  test('backupPath keeps same-basename backups distinct within the same timestamp', async () => {
    const { backupPath } = loadBackupModule(tempHome);
    const firstSource = path.join(tempHome, 'first', 'shared.txt');
    const secondSource = path.join(tempHome, 'second', 'shared.txt');

    require('fs').mkdirSync(path.dirname(firstSource), { recursive: true });
    require('fs').mkdirSync(path.dirname(secondSource), { recursive: true });
    writeFileSync(firstSource, 'first-content', 'utf8');
    writeFileSync(secondSource, 'second-content', 'utf8');

    const firstBackup = await backupPath(firstSource);
    const secondBackup = await backupPath(secondSource);

    expect(firstBackup).toBe(
      path.join(tempHome, '.sync-spells', 'backups', '2026-04-04T03-04-05', 'shared.txt'),
    );
    expect(secondBackup).toBe(
      path.join(tempHome, '.sync-spells', 'backups', '2026-04-04T03-04-05', 'shared-1.txt'),
    );
    expect(readFileSync(firstBackup, 'utf8')).toBe('first-content');
    expect(readFileSync(secondBackup, 'utf8')).toBe('second-content');
  });

  test('backupPath returns distinct paths for concurrent same-basename backups', async () => {
    const { backupPath } = loadBackupModule(tempHome);
    const firstSource = path.join(tempHome, 'concurrent-a', 'shared.txt');
    const secondSource = path.join(tempHome, 'concurrent-b', 'shared.txt');

    require('fs').mkdirSync(path.dirname(firstSource), { recursive: true });
    require('fs').mkdirSync(path.dirname(secondSource), { recursive: true });
    writeFileSync(firstSource, 'alpha', 'utf8');
    writeFileSync(secondSource, 'beta', 'utf8');

    const [firstBackup, secondBackup] = await Promise.all([backupPath(firstSource), backupPath(secondSource)]);

    expect(new Set([firstBackup, secondBackup]).size).toBe(2);
    expect(firstBackup).toContain(path.join(tempHome, '.sync-spells', 'backups', '2026-04-04T03-04-05'));
    expect(secondBackup).toContain(path.join(tempHome, '.sync-spells', 'backups', '2026-04-04T03-04-05'));
    expect(readFileSync(firstBackup, 'utf8')).toBe('alpha');
    expect(readFileSync(secondBackup, 'utf8')).toBe('beta');
  });
});
