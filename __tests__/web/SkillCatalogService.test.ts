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

  it('lists empty categories so newly-created categories are visible', async () => {
    await fs.mkdir(path.join(dir, 'research'), { recursive: true });

    const state = await new SkillCatalogService(cfg).getState();

    expect(state.categories.find((c) => c.name === 'research')).toEqual({
      name: 'research',
      skillRefs: [],
    });
  });

  it('excludes a depth-1 directory that has no SKILL.md (phantom skill)', async () => {
    // e.g. coding/playwright-conditional-ui-mocking with no SKILL.md
    await fs.mkdir(path.join(dir, 'coding', 'phantom-no-skillmd'), { recursive: true });
    const state = await new SkillCatalogService(cfg).getState();
    expect(state.skills.some((s) => s.ref === 'coding/phantom-no-skillmd')).toBe(false);
    const coding = state.categories.find((c) => c.name === 'coding')!;
    expect(coding.skillRefs).toEqual(['coding/git-commit', 'coding/scss']);
    const code = state.profiles.find((p) => p.name === 'code')!;
    expect(code.resolvedRefs).not.toContain('coding/phantom-no-skillmd');
  });

  it('does not recurse into nested reference dirs lacking SKILL.md', async () => {
    // e.g. coding/omf-shared/references/{ingest,mappings,patterns} — no SKILL.md anywhere
    for (const leaf of ['ingest', 'mappings', 'patterns']) {
      await fs.mkdir(path.join(dir, 'coding', 'omf-shared', 'references', leaf), { recursive: true });
      await fs.writeFile(path.join(dir, 'coding', 'omf-shared', 'references', leaf, 'INDEX.md'), '# notes\n');
    }
    const state = await new SkillCatalogService(cfg).getState();
    const phantomNames = ['ingest', 'mappings', 'patterns', 'omf-shared'];
    expect(state.skills.filter((s) => phantomNames.includes(s.name))).toEqual([]);
    expect(state.skills.some((s) => s.ref.startsWith('coding/omf-shared'))).toBe(false);
    const all = state.profiles.find((p) => p.name === 'all')!;
    expect(all.resolvedRefs).toEqual(['coding/git-commit', 'coding/scss']);
  });

  it('every listed skill has a readable SKILL.md (markdown endpoint never ENOENTs)', async () => {
    await fs.mkdir(path.join(dir, 'coding', 'phantom-no-skillmd'), { recursive: true });
    const state = await new SkillCatalogService(cfg).getState();
    for (const skill of state.skills) {
      await expect(fs.access(path.join(dir, skill.ref, 'SKILL.md'))).resolves.toBeUndefined();
    }
  });

  it('does not treat the profiles directory as a category', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    expect(state.categories.some((c) => c.name === 'profiles')).toBe(false);
  });

  it('moves a skill to inbox when removing it from its category', async () => {
    const svc = new SkillCatalogService(cfg);

    await svc.removeSkillFromCategory('coding', 'git-commit');

    await expect(fs.access(path.join(dir, 'coding', 'git-commit', 'SKILL.md'))).rejects.toThrow();
    await expect(fs.access(path.join(dir, 'inbox', 'git-commit', 'SKILL.md'))).resolves.toBeUndefined();

    const state = await svc.getState();
    expect(state.skills.some((s) => s.ref === 'coding/git-commit')).toBe(false);
    expect(state.skills.some((s) => s.ref === 'inbox/git-commit')).toBe(true);
  });

  it('moves a skill from one category to another category', async () => {
    const svc = new SkillCatalogService(cfg);

    const result = await svc.moveSkillToCategory('coding', 'scss', 'workflow');

    expect(result).toEqual({ removedRef: 'coding/scss', movedTo: 'workflow/scss' });
    await expect(fs.access(path.join(dir, 'coding', 'scss', 'SKILL.md'))).rejects.toThrow();
    await expect(fs.access(path.join(dir, 'workflow', 'scss', 'SKILL.md'))).resolves.toBeUndefined();

    const state = await svc.getState();
    expect(state.skills.some((s) => s.ref === 'coding/scss')).toBe(false);
    expect(state.skills.some((s) => s.ref === 'workflow/scss')).toBe(true);
  });

  it('creates an empty category directory', async () => {
    const svc = new SkillCatalogService(cfg);

    const result = await svc.createCategory('research');

    expect(result).toEqual({ name: 'research', skillRefs: [] });
    await expect(fs.access(path.join(dir, 'research'))).resolves.toBeUndefined();
    await expect(svc.buildCatalogByCategory()).resolves.toMatchObject({ research: [] });
  });
});
