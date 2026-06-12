import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const load = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({ ...actualOs, homedir: () => homeDir }));
  return require('../../src/web/ProfileWriter') as typeof import('../../src/web/ProfileWriter');
};

describe('ProfileWriter', () => {
  let dir: string; let home: string; let cfg: any;

  beforeEach(async () => {
    dir = path.join('/tmp', `pw-${Date.now()}`);
    home = path.join('/tmp', `pw-home-${Date.now()}`);
    for (const ref of ['coding/git-commit', 'coding/scss', 'workflow/task-run']) {
      await fs.mkdir(path.join(dir, ref), { recursive: true });
      await fs.writeFile(path.join(dir, ref, 'SKILL.md'), `---\nname: ${path.basename(ref)}\n---\n`);
    }
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir, 'profiles', 'code.json'),
      `${JSON.stringify({ name: 'code', categories: ['coding'], extras: ['workflow/task-run'] }, null, 2)}\n`);
    cfg = { source: dir, tools: {}, profilesDir: path.join(dir, 'profiles'), projectBindings: [] };
  });
  afterEach(async () => {
    jest.dontMock('os');
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  it('rejects a non-object / bad shape with ProfileValidationError (no write)', async () => {
    const { ProfileWriter, ProfileValidationError } = load(home);
    const before = await fs.readFile(path.join(dir, 'profiles', 'code.json'), 'utf8');
    await expect(new ProfileWriter(cfg).write('code', { name: 'code', categories: [1] }))
      .rejects.toBeInstanceOf(ProfileValidationError);
    expect(await fs.readFile(path.join(dir, 'profiles', 'code.json'), 'utf8')).toBe(before);
  });

  it('rejects an unknown category (no write)', async () => {
    const { ProfileWriter, ProfileValidationError } = load(home);
    await expect(new ProfileWriter(cfg).write('code', { name: 'code', categories: ['nope'] }))
      .rejects.toBeInstanceOf(ProfileValidationError);
  });

  it('rejects an unknown extra ref (no write)', async () => {
    const { ProfileWriter, ProfileValidationError } = load(home);
    await expect(new ProfileWriter(cfg).write('code', { name: 'code', extras: ['workflow/ghost'] }))
      .rejects.toBeInstanceOf(ProfileValidationError);
  });

  it('writes valid recipe, backs up old file, returns updated view', async () => {
    const { ProfileWriter } = load(home);
    const view = await new ProfileWriter(cfg).write('code', {
      name: 'code', categories: ['coding'], extras: [], excludes: ['coding/scss'],
    });
    expect(view.resolvedRefs).toEqual(['coding/git-commit']);
    expect(view.skillCount).toBe(1);
    const backups = await fs.readdir(path.join(home, '.sync-spells', 'backups'));
    expect(backups.length).toBeGreaterThan(0);
  });

  it('writes 2-space JSON with trailing newline and omits empty arrays', async () => {
    const { ProfileWriter } = load(home);
    await new ProfileWriter(cfg).write('code', { name: 'code', categories: ['coding'], extras: [], excludes: [] });
    const written = await fs.readFile(path.join(dir, 'profiles', 'code.json'), 'utf8');
    expect(written).toBe(`${JSON.stringify({ name: 'code', categories: ['coding'] }, null, 2)}\n`);
  });
});
