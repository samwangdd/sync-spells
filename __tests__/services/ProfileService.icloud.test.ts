/**
 * Regression guard for the `spells web` crash: a transient iCloud EPERM on `scandir` of the
 * profiles directory used to propagate out of `listProfiles` → `getState` → the HTTP handler,
 * killing the whole server process. `listProfiles` must retry it instead.
 *
 * `fs/promises` exports are non-configurable in Node 22, so the flake is injected with a module
 * mock (own file, so the mock never leaks into the other ProfileService tests) that delegates
 * every call to the real module except a one-shot readdir failure.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

const state = { readdirCalls: 0, failNextReaddir: false };

jest.mock('fs/promises', () => {
  const real = jest.requireActual('fs/promises') as typeof import('fs/promises');
  return {
    ...real,
    readdir: (...args: Parameters<typeof real.readdir>) => {
      state.readdirCalls++;
      if (state.failNextReaddir) {
        state.failNextReaddir = false;
        return Promise.reject(Object.assign(
          new Error("EPERM: operation not permitted, scandir '" + String(args[0]) + "'"),
          { code: 'EPERM', errno: -1, syscall: 'scandir' },
        ));
      }
      return (real.readdir as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import * as fs from 'fs/promises';
import * as path from 'path';
import { ProfileService } from '../../src/services/ProfileService';
import { Config } from '../../src/lib/config';

describe('ProfileService on a flaky iCloud source', () => {
  let testDir: string;
  let service: ProfileService;

  beforeAll(async () => {
    testDir = `/tmp/test-profiles-icloud-${Date.now()}`;
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'global.json'),
      JSON.stringify({ name: 'global', skills: ['global/git-commit'] }),
    );

    const config: Config = { source: testDir, tools: {}, profilesDir: path.join(testDir, 'profiles') };
    service = new ProfileService(config);
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('retries a transient EPERM scandir and still returns the profiles', async () => {
    state.readdirCalls = 0;
    state.failNextReaddir = true;

    const profiles = await service.listProfiles();

    expect(state.readdirCalls).toBe(2); // failed once, retried once
    expect(profiles.map(p => p.name)).toEqual(['global']);
  });

  it('still surfaces a permanent error without retrying', async () => {
    state.readdirCalls = 0;
    const missing = new ProfileService({
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'no-such-dir'),
    });

    // fs.access fails first, so listProfiles short-circuits to [] without a scandir
    await expect(missing.listProfiles()).resolves.toEqual([]);
    expect(state.readdirCalls).toBe(0);
  });
});
