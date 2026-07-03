import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, expandHome } from '../lib/config';
import { SourceService } from '../services/SourceService';

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const registerSources = (program: Command, getConfig: () => Promise<Config>): void => {
  const sourcesCmd = program.command('sources').description(
    'Integrate third-party skill sources declaratively (sources.json)\n' +
    '  sync [name]   Clone/pull sources and adopt their skills into the Library\n' +
    '  list          List configured sources and their skills'
  );

  sourcesCmd
    .command('sync [name]')
    .option('--update', 'Pull latest from each source repo before adopting', false)
    .description('Sync skill sources into the Library')
    .action(async (name: string | undefined, options: { update?: boolean }) => {
      const config = await getConfig();
      const service = new SourceService(config);

      try {
        const summary = await service.syncSources(name, { update: options.update });

        console.log('');
        for (const source of summary.sources) {
          console.log(`Source: ${source.name} (${source.action})`);
          console.log(`  repo:  ${source.repo}`);
          console.log(`  cache: ${source.cache}`);
          for (const skill of source.skills) {
            const adopt = skill.existed ? 'exists ' : 'adopted';
            const glob = skill.addedToGlobal ? ' +global' : '';
            console.log(`    [${adopt}] ${skill.target}${glob}`);
          }
        }
        console.log('');
      } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  sourcesCmd
    .command('list')
    .description('List configured skill sources')
    .action(async () => {
      const config = await getConfig();
      const service = new SourceService(config);

      try {
        const sourcesConfig = await service.readSourcesConfig();

        console.log('\nConfigured sources:');
        for (const source of sourcesConfig.sources) {
          const cache = expandHome(
            source.cache ?? path.join(config.source, '.vendor', source.name)
          );
          console.log(`\n  ${source.name}`);
          console.log(`    repo:  ${source.repo}`);
          console.log(`    cache: ${cache}`);
          for (const skill of source.skills) {
            const skillName = path.basename(skill.path);
            const target = `${skill.category}/${skillName}`;
            const adopted = await fileExists(
              path.join(config.source, skill.category, skillName, 'SKILL.md')
            );
            const mark = adopted ? '✓' : '✗';
            const glob = skill.global ? ' (global)' : '';
            console.log(`      [${mark}] ${target}${glob}`);
          }
        }
        console.log('');
      } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });
};
