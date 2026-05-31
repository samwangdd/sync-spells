import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { MigrateService } from '../../src/services/MigrateService';

describe('MigrateService', () => {
  let dir: string;
  let cfg: Config;

  beforeEach(async () => {
    dir = `/tmp/migrate-${Date.now()}/skills-registry`;
    for (const s of [
      'global/git-commit',
      'domains/frontend/web-perf',
      'domains/lark/lark-doc',
      'projects/mexc/kickoff',
      'projects/mexc/sensors-impl',
      'workflows/marathon',
      'projects/lifeos/task-run',
      'projects/lifeos/llm-wiki',
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
      fs.access(path.join(dir, 'collaboration', 'lark-doc'))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(dir, 'workflow', 'marathon'))
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(dir, 'workflow', 'kickoff'))
    ).resolves.toBeUndefined(); // mexc flow
    await expect(
      fs.access(path.join(dir, 'coding', 'sensors-impl'))
    ).resolves.toBeUndefined(); // mexc tech
    await expect(
      fs.access(path.join(dir, 'workflow', 'task-run'))
    ).resolves.toBeUndefined(); // lifeos flow
    await expect(
      fs.access(path.join(dir, 'coding', 'llm-wiki'))
    ).resolves.toBeUndefined(); // lifeos tech
    await expect(
      fs.access(path.join(dir, 'code'))
    ).rejects.toBeTruthy(); // empty shell removed

    const prof = JSON.parse(
      await fs.readFile(path.join(dir, 'profiles', 'mexc.json'), 'utf8')
    );
    expect(prof.skills).toBeUndefined();
    expect(prof.extras).toEqual(
      expect.arrayContaining([
        'coding/web-perf',
        'collaboration/lark-doc',
        'workflow/kickoff',
        'coding/sensors-impl',
      ])
    );
    expect(prof.extras.some((s: string) => s.startsWith('global/'))).toBe(
      false
    ); // global dropped
    expect(report.backupDir).toContain(
      'skills-registry-backup-20260531-000000'
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

    it('maps domains/lark/* to collaboration/*', () => {
      expect(svc.mapOldToNew('domains/lark/lark-doc')).toBe(
        'collaboration/lark-doc'
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

    it('maps projects/lifeos/llm-wiki to coding/llm-wiki', () => {
      expect(svc.mapOldToNew('projects/lifeos/llm-wiki')).toBe(
        'coding/llm-wiki'
      );
    });

    it('maps mexc flow skills to workflow/*', () => {
      expect(svc.mapOldToNew('projects/mexc/kickoff')).toBe('workflow/kickoff');
      expect(svc.mapOldToNew('projects/mexc/pre-qa')).toBe('workflow/pre-qa');
      expect(svc.mapOldToNew('projects/mexc/submit-review')).toBe(
        'workflow/submit-review'
      );
    });

    it('maps mexc tech skills to coding/*', () => {
      expect(svc.mapOldToNew('projects/mexc/sensors-impl')).toBe(
        'coding/sensors-impl'
      );
    });

    it('returns null for global/* (unchanged)', () => {
      expect(svc.mapOldToNew('global/git-commit')).toBeNull();
    });

    it('returns null for external/* (unchanged)', () => {
      expect(svc.mapOldToNew('external/some-skill')).toBeNull();
    });

    it('returns null for inbox/* (unchanged)', () => {
      expect(svc.mapOldToNew('inbox/draft-skill')).toBeNull();
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
});
