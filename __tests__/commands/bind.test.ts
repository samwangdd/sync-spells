import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';

describe('bind command helpers', () => {
  let tempHome: string;
  let registryDir: string;
  let cfg: Config;

  beforeEach(async () => {
    tempHome = `/tmp/bind-home-${Date.now()}`;
    registryDir = path.join(tempHome, 'registry');
    await fs.mkdir(path.join(registryDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(registryDir, 'profiles', 'coding.json'),
      JSON.stringify({ name: 'coding', categories: ['coding'] })
    );
    cfg = {
      source: registryDir,
      tools: {},
      profilesDir: path.join(registryDir, 'profiles'),
    };
  });

  afterEach(async () => {
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('adds, replaces, lists, and removes project bindings', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));
    const { readConfig, writeConfig } = await import('../../src/lib/config');
    const { runBindAdd, runBindList, runBindRemove } = await import('../../src/commands/bind');

    await writeConfig(cfg);
    const first = await runBindAdd(await readConfig(), path.join(tempHome, 'codeLab'), 'coding');
    expect(first).toEqual([{ path: path.join(tempHome, 'codeLab'), profile: 'coding' }]);

    const listed = runBindList(await readConfig());
    expect(listed).toEqual(first);

    const second = await runBindAdd(await readConfig(), path.join(tempHome, 'codeLab'), 'coding');
    expect(second).toHaveLength(1);

    const remaining = await runBindRemove(await readConfig(), path.join(tempHome, 'codeLab'));
    expect(remaining).toEqual([]);
  });

  it('rejects bindings to missing profiles', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));
    const { writeConfig, readConfig } = await import('../../src/lib/config');
    const { runBindAdd } = await import('../../src/commands/bind');

    await writeConfig(cfg);
    await expect(
      runBindAdd(await readConfig(), path.join(tempHome, 'codeLab'), 'missing')
    ).rejects.toThrow('Profile not found: missing');
  });
});
