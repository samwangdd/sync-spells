import { Command } from 'commander';
import { Config, readConfig } from '../lib/config';
import { MigrateService } from '../services/MigrateService';

const makeStamp = (): string =>
  new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export const runMigrate = async (
  config: Config,
  opts: { dryRun: boolean }
) => {
  const stamp = makeStamp();
  return new MigrateService(config).migrate({ dryRun: opts.dryRun, stamp });
};

export const registerMigrate = (
  program: Command,
  getConfig: () => Promise<Config> = readConfig
): void => {
  program
    .command('migrate')
    .option('--dry-run', 'Preview the migration without changing files')
    .description('Migrate registry to the category structure and convert profiles')
    .action(async (opts: { dryRun?: boolean }) => {
      const config = await getConfig();
      try {
        const report = await runMigrate(config, { dryRun: !!opts.dryRun });
        console.log(
          `\n${report.dryRun ? '[DRY-RUN] ' : ''}Migration ${report.dryRun ? 'plan' : 'complete'}:`
        );
        if (report.backupDir) console.log(`  backup: ${report.backupDir}`);
        console.log(`  moved dirs: ${report.movedDirs.length}`);
        report.movedDirs.forEach((m) => console.log(`    ${m.from} -> ${m.to}`));
        if (report.removedDirs.length)
          console.log(`  removed: ${report.removedDirs.join(', ')}`);
        console.log(
          `  converted profiles: ${report.convertedProfiles.join(', ') || '(none)'}`
        );
        report.notes.forEach((n) => console.log(`  note: ${n}`));
        console.log('');
      } catch (e) {
        console.error(`\nError: ${e}\n`);
        process.exit(1);
      }
    });
};
