import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { SkillCatalogService } from '../../src/web/SkillCatalogService';

describe('SkillCatalogService', () => {
  let dir: string; let cfg: Config;

  const writeSkill = async (ref: string, frontmatter: string) => {
    await fs.mkdir(path.join(dir, ref), { recursive: true });
    await fs.writeFile(path.join(dir, ref, 'SKILL.md'), `---\n${frontmatter}\n---\n# ${ref}\n`);
  };

  beforeEach(async () => {
    dir = path.join('/tmp', `catalog-${Date.now()}`);
    await writeSkill('coding/git-commit', 'name: git-commit\ndescription: Commit helper.');
    await writeSkill('coding/scss', 'name: scss\nversion: 2.0.0');
    await writeSkill('workflow/jira-handoff', 'name: jira-handoff\ndescription: Handoff.\nmetadata:\n  requires:\n    bins: ["jira"]');
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir, 'profiles', 'all.json'),
      JSON.stringify({ name: 'all', categories: ['coding', 'workflow'], excludes: ['workflow/jira-handoff'] }));
    await fs.writeFile(path.join(dir, 'profiles', 'code.json'),
      JSON.stringify({ name: 'code', categories: ['coding'] }));
    cfg = {
      source: dir, tools: {}, profilesDir: path.join(dir, 'profiles'),
      projectBindings: [{ path: '/tmp/proj-x', profile: 'code' }],
    };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('builds skill cards with frontmatter fields', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const scss = state.skills.find((s) => s.ref === 'coding/scss');
    expect(scss?.version).toBe('2.0.0');
    const jira = state.skills.find((s) => s.ref === 'workflow/jira-handoff');
    expect(jira?.requiresBins).toEqual(['jira']);
  });

  it('computes inProfiles by resolved membership (excludes respected)', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const gitCommit = state.skills.find((s) => s.ref === 'coding/git-commit');
    expect(gitCommit?.inProfiles.sort()).toEqual(['all', 'code']);
    const jira = state.skills.find((s) => s.ref === 'workflow/jira-handoff');
    expect(jira?.inProfiles).toEqual([]); // excluded from 'all', not in 'code'
  });

  it('builds profile views with resolvedRefs, skillCount and boundPaths', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const all = state.profiles.find((p) => p.name === 'all')!;
    expect(all.resolvedRefs.sort()).toEqual(['coding/git-commit', 'coding/scss']);
    expect(all.skillCount).toBe(2);
    const code = state.profiles.find((p) => p.name === 'code')!;
    expect(code.boundPaths).toEqual(['/tmp/proj-x']);
  });

  it('lists categories with sorted skillRefs', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const coding = state.categories.find((c) => c.name === 'coding')!;
    expect(coding.skillRefs).toEqual(['coding/git-commit', 'coding/scss']);
  });
});
