import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { runMigrate } from '../../src/commands/migrate';

describe('runMigrate', () => {
  let dir: string;
  let cfg: Config;

  beforeEach(async () => {
    dir = `/tmp/migrate-cmd-${Date.now()}/skills-registry`;
    for (const s of [
      'global/git-commit',
      'domains/frontend/web-perf',
      'domains/lark/lark-doc',
      'projects/mexc/kickoff',
      'projects/mexc/sensors-impl',
    ]) {
      await fs.mkdir(path.join(dir, s), { recursive: true });
    }
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'profiles', 'dev.json'),
      JSON.stringify({
        name: 'dev',
        skills: [
          'global/git-commit',
          'domains/frontend/web-perf',
          'projects/mexc/kickoff',
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

  it('dry-run returns a plan without touching the filesystem', async () => {
    const report = await runMigrate(cfg, { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.movedDirs.length).toBeGreaterThan(0);
    expect(report.backupDir).toBeNull();

    // Source dirs still in old locations
    await expect(
      fs.access(path.join(dir, 'domains', 'frontend', 'web-perf'))
    ).resolves.toBeUndefined();

    // New locations do NOT exist yet
    await expect(
      fs.access(path.join(dir, 'coding', 'web-perf'))
    ).rejects.toBeTruthy();
  });

  it('dry-run reports planned moves including web-perf', async () => {
    const report = await runMigrate(cfg, { dryRun: true });

    expect(
      report.movedDirs.some(
        (m) =>
          m.from.includes('domains/frontend/web-perf') &&
          m.to.includes('coding/web-perf')
      )
    ).toBe(true);
  });

  it('performs migration and moves dirs to new structure', async () => {
    const report = await runMigrate(cfg, { dryRun: false });

    expect(report.dryRun).toBe(false);
    expect(report.backupDir).toBeTruthy();

    // web-perf moved to coding/
    await expect(
      fs.access(path.join(dir, 'coding', 'web-perf'))
    ).resolves.toBeUndefined();

    // lark-doc moved to workflow/
    await expect(
      fs.access(path.join(dir, 'workflow', 'lark-doc'))
    ).resolves.toBeUndefined();

    // kickoff (mexc project skill) moved to coding/
    await expect(
      fs.access(path.join(dir, 'coding', 'kickoff'))
    ).resolves.toBeUndefined();

    // sensors-impl (mexc tech) moved to coding/
    await expect(
      fs.access(path.join(dir, 'coding', 'sensors-impl'))
    ).resolves.toBeUndefined();
  });

  it('performs migration and converts profiles', async () => {
    const report = await runMigrate(cfg, { dryRun: false });

    expect(report.convertedProfiles.length).toBeGreaterThan(0);

    const prof = JSON.parse(
      await fs.readFile(path.join(dir, 'profiles', 'dev.json'), 'utf8')
    );
    expect(prof.skills).toBeUndefined();
    expect(Array.isArray(prof.extras)).toBe(true);
    // global/git-commit dropped; web-perf remapped to coding/web-perf
    expect(prof.extras).toContain('coding/web-perf');
    expect(prof.extras.some((s: string) => s.startsWith('global/'))).toBe(false);
  });

  it('movedDirs paths are absolute', async () => {
    const report = await runMigrate(cfg, { dryRun: true });

    for (const { from, to } of report.movedDirs) {
      expect(path.isAbsolute(from)).toBe(true);
      expect(path.isAbsolute(to)).toBe(true);
    }
  });
});
