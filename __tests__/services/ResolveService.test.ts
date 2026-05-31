import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { ProfileService } from '../../src/services/ProfileService';
import { SkillService } from '../../src/services/SkillService';
import { ResolveService } from '../../src/services/ResolveService';

describe('ResolveService', () => {
  let dir: string; let cfg: Config;
  beforeEach(async () => {
    dir = `/tmp/resolve-${Date.now()}`;
    for (const s of ['global/git-commit','coding/web-perf','coding/scss','collaboration/lark-doc','workflow/task-run'])
      await fs.mkdir(path.join(dir, s), { recursive: true });
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir,'profiles','mexc.json'),
      JSON.stringify({ name:'mexc', categories:['coding'], extras:['collaboration/lark-doc'] }));
    await fs.writeFile(path.join(dir,'profiles','base.json'),
      JSON.stringify({ name:'base', categories:['workflow'] }));
    await fs.writeFile(path.join(dir,'profiles','child.json'),
      JSON.stringify({ name:'child', extends:'base', categories:['coding'] }));
    await fs.writeFile(path.join(dir,'profiles','legacy.json'),
      JSON.stringify({ name:'legacy', skills:['global/git-commit','coding/scss'] }));
    cfg = { source: dir, tools: {}, profilesDir: path.join(dir,'profiles') };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const mk = () => new ResolveService(cfg, new ProfileService(cfg), new SkillService(cfg));

  it('expands categories and extras, excludes global', async () => {
    const r = await mk().resolve('mexc');
    expect(r.skills.sort()).toEqual(['coding/scss','coding/web-perf','collaboration/lark-doc'].sort());
    expect(r.skills.some(s => s.startsWith('global/'))).toBe(false);
  });
  it('resolves extends recursively', async () => {
    const r = await mk().resolve('child');
    expect(r.skills.sort()).toEqual(['coding/scss','coding/web-perf','workflow/task-run'].sort());
  });
  it('legacy skills filter out global', async () => {
    const r = await mk().resolve('legacy');
    expect(r.skills).toEqual(['coding/scss']);
  });
  it('throws on circular extends', async () => {
    await fs.writeFile(path.join(dir,'profiles','a.json'), JSON.stringify({name:'a',extends:'b'}));
    await fs.writeFile(path.join(dir,'profiles','b.json'), JSON.stringify({name:'b',extends:'a'}));
    await expect(mk().resolve('a')).rejects.toThrow(/[Cc]ircular/);
  });
});
