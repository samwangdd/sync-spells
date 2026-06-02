import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { MigrateService } from '../../src/services/MigrateService';

describe('MigrateService', () => {
  let dir: string;
  let cfg: Config;

  beforeEach(async () => {
    dir = `/tmp/migrate-${Date.now()}/skill-category`;
    for (const s of [
      'global/git-commit',
      'domains/frontend/web-perf',
      'domains/lark/lark-doc',
      'projects/mexc/kickoff',
      'projects/mexc/sensors-impl',
      'workflows/marathon',
      'projects/lifeos/task-run',
      'projects/lifeos/llm-wiki',
      'external/lokalise-skill',
      'inbox/k8s-migration-planner',
      'inbox/twitter-style',
      'code',
      'root-files',
    ]) {
      await fs.mkdir(path.join(dir, s), { recursive: true });
    }
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'profiles', 'mexc.json'),
      JSON.stringify({
        name: 'mexc',
        skills: [
          'global/git-commit',
          'domains/frontend/web-perf',
          'domains/lark/lark-doc',
          'projects/mexc/kickoff',
          'projects/mexc/sensors-impl',
        ],
      })
    );
    cfg = {
      source: dir,
      tools: {},
      profilesDir: path.join(dir, 'profiles'),
    };
  });

  afterEach(async () => {
    await fs.rm(path.dirname(dir), { recursive: true, force: true });
  });

  it('restructures dirs, converts profiles, creates backup', async () => {
    const report = await new MigrateService(cfg).migrate({
      dryRun: false,
      stamp: '20260531-000000',
    });

    await expect(
      fs.access(path.join(dir, 'coding', 'web-perf'))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(dir, 'workflow', 'lark-doc'))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(dir, 'workflow', 'marathon'))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(dir, 'coding', 'kickoff'))
    ).resolves.toBeUndefined(); // mexc dev project skill
    await expect(
      fs.access(path.join(dir, 'coding', 'sensors-impl'))
    ).resolves.toBeUndefined(); // mexc tech
    await expect(
      fs.access(path.join(dir, 'workflow', 'task-run'))
    ).resolves.toBeUndefined(); // lifeos flow
    await expect(
      fs.access(path.join(dir, 'knowledge', 'llm-wiki'))
    ).resolves.toBeUndefined(); // lifeos knowledge
    await expect(
      fs.access(path.join(dir, 'code'))
    ).rejects.toBeTruthy(); // empty shell removed
    await expect(
      fs.access(path.join(dir, 'inbox', 'k8s-migration-planner'))
    ).resolves.toBeUndefined(); // inactive registry area preserved

    const prof = JSON.parse(
      await fs.readFile(path.join(dir, 'profiles', 'mexc.json'), 'utf8')
    );
    expect(prof.skills).toBeUndefined();
    expect(prof.extras).toEqual(
      expect.arrayContaining([
        'coding/web-perf',
        'workflow/lark-doc',
        'coding/kickoff',
        'coding/sensors-impl',
      ])
    );
    expect(prof.extras.some((s: string) => s.startsWith('global/'))).toBe(
      false
    ); // global dropped
    expect(report.backupDir).toContain(
      'skill-category-backup-20260531-000000'
    );
  });

  it('dry-run does not touch the filesystem', async () => {
    const report = await new MigrateService(cfg).migrate({
      dryRun: true,
      stamp: 'x',
    });
    await expect(
      fs.access(path.join(dir, 'domains', 'frontend', 'web-perf'))
    ).resolves.toBeUndefined(); // still old
    await expect(
      fs.access(path.join(dir, 'coding', 'web-perf'))
    ).rejects.toBeTruthy();
    expect(report.backupDir).toBeNull();
    expect(report.movedDirs.length).toBeGreaterThan(0);
  });

  describe('mapOldToNew', () => {
    let svc: MigrateService;

    beforeEach(() => {
      svc = new MigrateService(cfg);
    });

    it('maps domains/frontend/* to coding/*', () => {
      expect(svc.mapOldToNew('domains/frontend/web-perf')).toBe(
        'coding/web-perf'
      );
    });

    it('maps domains/figma/* to coding/*', () => {
      expect(svc.mapOldToNew('domains/figma/figma-skill')).toBe(
        'coding/figma-skill'
      );
    });

    it('maps domains/lark/* to workflow/*', () => {
      expect(svc.mapOldToNew('domains/lark/lark-doc')).toBe(
        'workflow/lark-doc'
      );
    });

    it('maps workflows/* to workflow/*', () => {
      expect(svc.mapOldToNew('workflows/marathon')).toBe('workflow/marathon');
    });

    it('maps projects/omf/* to workflow/*', () => {
      expect(svc.mapOldToNew('projects/omf/sprint-planning')).toBe(
        'workflow/sprint-planning'
      );
    });

    it('maps projects/lifeos/* to workflow/* by default', () => {
      expect(svc.mapOldToNew('projects/lifeos/task-run')).toBe(
        'workflow/task-run'
      );
    });

    it('maps projects/lifeos/llm-wiki to knowledge/llm-wiki', () => {
      expect(svc.mapOldToNew('projects/lifeos/llm-wiki')).toBe(
        'knowledge/llm-wiki'
      );
    });

    it('maps mexc skills to coding/*', () => {
      expect(svc.mapOldToNew('projects/mexc/kickoff')).toBe('coding/kickoff');
      expect(svc.mapOldToNew('projects/mexc/pre-qa')).toBe('coding/pre-qa');
      expect(svc.mapOldToNew('projects/mexc/submit-review')).toBe(
        'coding/submit-review'
      );
      expect(svc.mapOldToNew('projects/mexc/sensors-impl')).toBe(
        'coding/sensors-impl'
      );
    });

    it('returns null for global/* (unchanged)', () => {
      expect(svc.mapOldToNew('global/git-commit')).toBeNull();
    });

    it('maps external/* to workflow/*', () => {
      expect(svc.mapOldToNew('external/some-skill')).toBe('workflow/some-skill');
    });

    it('keeps inbox/* unchanged as an inactive registry area', () => {
      expect(svc.mapOldToNew('inbox/k8s-migration-planner')).toBeNull();
      expect(svc.mapOldToNew('inbox/twitter-style')).toBeNull();
      expect(svc.mapOldToNew('inbox/jira-mcp-setup')).toBeNull();
    });
  });

  it('report includes movedDirs and removedDirs', async () => {
    const report = await new MigrateService(cfg).migrate({
      dryRun: false,
      stamp: '20260531-000000',
    });
    expect(report.dryRun).toBe(false);
    expect(report.movedDirs.length).toBeGreaterThan(0);
    expect(
      report.movedDirs.some(
        (m: { from: string; to: string }) =>
          m.from.includes('domains/frontend/web-perf') &&
          m.to.includes('coding/web-perf')
      )
    ).toBe(true);
    expect(report.convertedProfiles.length).toBeGreaterThan(0);
    expect(report.notes.length).toBeGreaterThan(0); // hints
  });

  it('already-migrated profiles are left unchanged', async () => {
    // Write a profile that already has extras/categories
    await fs.writeFile(
      path.join(dir, 'profiles', 'already.json'),
      JSON.stringify({
        name: 'already',
        categories: ['coding'],
        extras: ['coding/some-skill'],
      })
    );
    await new MigrateService(cfg).migrate({
      dryRun: false,
      stamp: '20260531-000000',
    });
    const prof = JSON.parse(
      await fs.readFile(path.join(dir, 'profiles', 'already.json'), 'utf8')
    );
    expect(prof.categories).toEqual(['coding']);
    expect(prof.extras).toEqual(['coding/some-skill']);
    expect(prof.skills).toBeUndefined();
  });

  it('promotes known project presets to category profiles', async () => {
    await fs.writeFile(
      path.join(dir, 'profiles', 'mexc-code.json'),
      JSON.stringify({
        name: 'mexc-code',
        skills: [
          'projects/mexc/kickoff',
          'projects/mexc/sensors-impl',
          'domains/lark/lark-doc',
        ],
      })
    );
    await fs.writeFile(
      path.join(dir, 'profiles', 'lifeos-knowledge.json'),
      JSON.stringify({
        name: 'lifeos-knowledge',
        skills: [
          'projects/lifeos/llm-wiki',
          'projects/lifeos/task-run',
          'projects/mexc/kickoff',
        ],
      })
    );

    await new MigrateService(cfg).migrate({
      dryRun: false,
      stamp: '20260531-000000',
    });

    const mexc = JSON.parse(
      await fs.readFile(path.join(dir, 'profiles', 'mexc-code.json'), 'utf8')
    );
    expect(mexc.categories).toEqual(['coding']);
    expect(mexc.extras).toEqual(['workflow/lark-doc']);

    const lifeos = JSON.parse(
      await fs.readFile(
        path.join(dir, 'profiles', 'lifeos-knowledge.json'),
        'utf8'
      )
    );
    expect(lifeos.categories).toEqual(['knowledge', 'workflow']);
    expect(lifeos.extras).toEqual(['coding/kickoff']);
  });
});
