import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  defaultManifest,
  readManifest,
  writeManifest,
  MANIFEST_FILE,
} from '../../src/lib/workspace';

describe('workspace manifest', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-ws-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('readManifest returns defaultManifest when file is absent', async () => {
    await expect(readManifest(root)).resolves.toEqual(defaultManifest);
  });

  test('writeManifest then readManifest round-trips', async () => {
    const manifest = { ...defaultManifest, legacy: ['legacy-commands'] };
    await writeManifest(root, manifest);
    await expect(readManifest(root)).resolves.toEqual(manifest);
  });

  test('readManifest falls back to default for malformed manifest', async () => {
    await writeFile(path.join(root, MANIFEST_FILE), JSON.stringify({ version: 'x' }), 'utf8');
    await expect(readManifest(root)).resolves.toEqual(defaultManifest);
  });
});
