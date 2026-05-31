import { runPresetsList, runPresetsShow } from '../../src/commands/presets';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('preset command', () => {
  let testDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-presets-cmd-${Date.now()}`;

    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'coding.json'),
      JSON.stringify({
        name: 'coding',
        description: 'Coding preset',
        skills: ['global/git-commit']
      })
    );

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles')
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should list presets from profile storage', async () => {
    const presets = await runPresetsList(config);

    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('coding');
  });

  it('should show preset details from profile storage', async () => {
    const { profile, validation } = await runPresetsShow(config, 'coding');

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('coding');
    expect(validation).not.toBeNull();
  });
});
