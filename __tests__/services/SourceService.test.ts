import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { SourceService } from '../../src/services/SourceService';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SourceService', () => {
  let testDir: string;
  let sourceDir: string;
  let profilesDir: string;
  let cacheDir: string;
  let config: Config;

  const readGlobalExtras = async (): Promise<string[]> => {
    const raw = await fs.readFile(path.join(profilesDir, 'global.json'), 'utf8');
    return JSON.parse(raw).extras as string[];
  };

  beforeEach(async () => {
    testDir = `/tmp/test-sources-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sourceDir = path.join(testDir, 'skill-category');
    profilesDir = path.join(testDir, 'profiles');
    cacheDir = path.join(testDir, 'fake-cache');

    // Source registry root + profiles/global.json (empty extras)
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(profilesDir, { recursive: true });
    await fs.writeFile(
      path.join(profilesDir, 'global.json'),
      `${JSON.stringify({ name: 'global', extras: [], categories: ['foundation'] }, null, 2)}\n`
    );

    // Fake cache acting as an already-cloned repo
    await fs.mkdir(path.join(cacheDir, 'skills', 'engineering', 'tdd'), { recursive: true });
    await fs.writeFile(
      path.join(cacheDir, 'skills', 'engineering', 'tdd', 'SKILL.md'),
      '# TDD from upstream'
    );
    await fs.mkdir(path.join(cacheDir, 'skills', 'productivity', 'teach'), { recursive: true });
    await fs.writeFile(
      path.join(cacheDir, 'skills', 'productivity', 'teach', 'SKILL.md'),
      '# Teach from upstream'
    );

    // sources.json under config.source
    await fs.writeFile(
      path.join(sourceDir, 'sources.json'),
      `${JSON.stringify({
        sources: [
          {
            name: 'fixture',
            repo: 'https://example.com/fixture.git',
            cache: cacheDir,
            skills: [
              { path: 'skills/engineering/tdd', category: 'coding', global: true },
              { path: 'skills/productivity/teach', category: 'knowledge' }
            ]
          }
        ]
      }, null, 2)}\n`
    );

    config = { source: sourceDir, tools: {}, profilesDir };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('copies skills into the registry under <category>/<name>', async () => {
    const service = new SourceService(config);
    await service.syncSources();

    await expect(
      fs.access(path.join(sourceDir, 'coding', 'tdd', 'SKILL.md'))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(sourceDir, 'knowledge', 'teach', 'SKILL.md'))
    ).resolves.toBeUndefined();
  });

  it('merges global:true skills into global.json extras exactly once', async () => {
    const service = new SourceService(config);
    await service.syncSources();

    const extras = await readGlobalExtras();
    expect(extras.filter(e => e === 'coding/tdd')).toHaveLength(1);
    // non-global skill must NOT be added to extras
    expect(extras).not.toContain('knowledge/teach');
  });

  it('is idempotent: running twice does not duplicate extras', async () => {
    const service = new SourceService(config);
    await service.syncSources();
    await service.syncSources();

    const extras = await readGlobalExtras();
    expect(extras.filter(e => e === 'coding/tdd')).toHaveLength(1);
  });

  it('does not overwrite an existing target SKILL.md (addSkill protection)', async () => {
    await fs.mkdir(path.join(sourceDir, 'coding', 'tdd'), { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'coding', 'tdd', 'SKILL.md'),
      '# CUSTOM LOCAL CONTENT'
    );

    const service = new SourceService(config);
    await service.syncSources();

    const content = await fs.readFile(
      path.join(sourceDir, 'coding', 'tdd', 'SKILL.md'),
      'utf8'
    );
    expect(content).toBe('# CUSTOM LOCAL CONTENT');
  });

  it('throws a clear error when sources.json is missing', async () => {
    await fs.rm(path.join(sourceDir, 'sources.json'));
    const service = new SourceService(config);
    await expect(service.syncSources()).rejects.toThrow(/sources\.json/);
  });

  it('returns a summary describing each synced skill', async () => {
    const service = new SourceService(config);
    const summary = await service.syncSources();

    expect(summary.sources).toHaveLength(1);
    const skills = summary.sources[0].skills;
    const tdd = skills.find(s => s.target === 'coding/tdd');
    expect(tdd).toBeDefined();
    expect(tdd!.addedToGlobal).toBe(true);
    const teach = skills.find(s => s.target === 'knowledge/teach');
    expect(teach!.addedToGlobal).toBe(false);
  });
});
