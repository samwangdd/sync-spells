import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { runWeb, resolveWithin } from '../../src/commands/web';

describe('runWeb', () => {
  let dir: string; let cfg: Config;
  beforeEach(async () => {
    dir = path.join('/tmp', `web-${Date.now()}`);
    await fs.mkdir(path.join(dir, 'coding', 'git-commit'), { recursive: true });
    await fs.writeFile(path.join(dir, 'coding', 'git-commit', 'SKILL.md'), `---\nname: git-commit\n---\n`);
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir, 'profiles', 'code.json'),
      JSON.stringify({ name: 'code', categories: ['coding'] }));
    cfg = { source: dir, tools: {}, profilesDir: path.join(dir, 'profiles'), projectBindings: [] };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('assembles dependencies and can build AppState without listening', async () => {
    const handle = runWeb(cfg);
    const state = await handle.getState();
    expect(state.profiles.map((p) => p.name)).toContain('code');
    expect(state.skills.map((s) => s.ref)).toContain('coding/git-commit');
    expect(typeof handle.createServer).toBe('function');
  });
});

describe('resolveWithin', () => {
  it('returns resolved path for a safe relative ref', () => {
    const result = resolveWithin('/base', 'coding/git-commit');
    expect(result).toBe(path.resolve('/base', 'coding/git-commit'));
  });

  it('throws on path traversal via ../', () => {
    expect(() => resolveWithin('/base', '../../etc/passwd')).toThrow(/Path traversal/);
  });

  it('throws on absolute ref that escapes base', () => {
    expect(() => resolveWithin('/base', '/etc/passwd')).toThrow(/Path traversal/);
  });

  it('returns the base itself for an empty ref', () => {
    const result = resolveWithin('/base', '');
    expect(result).toBe(path.resolve('/base'));
  });
});
