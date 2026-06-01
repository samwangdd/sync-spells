import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { runResolve } from '../../src/commands/resolve';

describe('resolve command', () => {
  let dir: string; let cfg: Config;
  beforeEach(async () => {
    dir = `/tmp/resolve-cmd-${Date.now()}`;
    for (const s of ['global/git-commit','coding/web-perf','collaboration/lark-doc'])
      await fs.mkdir(path.join(dir, s), { recursive: true });
    await fs.mkdir(path.join(dir,'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir,'profiles','mexc.json'),
      JSON.stringify({ name:'mexc', categories:['coding'], extras:['collaboration/lark-doc'] }));
    await fs.writeFile(path.join(dir,'profiles','coding.json'),
      JSON.stringify({ name:'coding', categories:['coding'] }));
    cfg = {
      source: dir,
      tools: {},
      profilesDir: path.join(dir,'profiles'),
      projectBindings: [{ path: path.join(dir, 'project'), profile: 'coding' }],
    };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  it('runResolve returns resolved skills (no global)', async () => {
    const r = await runResolve(cfg, 'mexc');
    expect(r.skills).toContain('collaboration/lark-doc');
    expect(r.skills).toContain('coding/web-perf');
    expect(r.skills.some(s => s.startsWith('global/'))).toBe(false);
  });
  it('runResolve infers profile from project bindings when omitted', async () => {
    const r = await runResolve(cfg, undefined, path.join(dir, 'project', 'child'));
    expect(r.name).toBe('coding');
    expect(r.skills).toEqual(['coding/web-perf']);
  });
});
