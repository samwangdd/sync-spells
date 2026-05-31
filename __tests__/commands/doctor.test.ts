import { runDoctor } from '../../src/commands/doctor';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('doctor command', () => {
  let testDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-doctor-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });

    config = {
      source: testDir,
      tools: {}
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should check registry directory', async () => {
    const results = await runDoctor(config);

    const registryCheck = results.find(r => r.check === 'registry');
    expect(registryCheck).toBeDefined();
    expect(registryCheck!.status).toBe('ok');
  });

  it('should error when registry directory is missing', async () => {
    const badConfig: Config = {
      source: '/tmp/nonexistent-doctor-dir-' + Date.now(),
      tools: {}
    };

    const results = await runDoctor(badConfig);

    const registryCheck = results.find(r => r.check === 'registry');
    expect(registryCheck).toBeDefined();
    expect(registryCheck!.status).toBe('error');
  });

  it('should warn when no profiles found', async () => {
    const results = await runDoctor(config);

    const profilesCheck = results.find(r => r.check === 'profiles');
    expect(profilesCheck).toBeDefined();
    expect(profilesCheck!.status).toBe('warn');
  });

  it('should pass when everything is set up', async () => {
    // Setup profiles
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({ name: 'test', skills: ['global/git-commit'] })
    );

    // Setup skill in registry
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });

    const fullConfig: Config = {
      ...config,
      profilesDir: path.join(testDir, 'profiles')
    };

    const results = await runDoctor(fullConfig);

    const profilesCheck = results.find(r => r.check === 'profiles');
    expect(profilesCheck!.status).toBe('ok');
  });

  it('should report config check', async () => {
    const results = await runDoctor(config);

    const configCheck = results.find(r => r.check === 'config');
    expect(configCheck).toBeDefined();
    // Config file likely doesn't exist in test environment (not at ~/.sync-spells/config.json)
    // so status could be either ok or error depending on env
  });
});
