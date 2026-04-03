import { Command } from 'commander';

const program = new Command();

program
  .name('spells')
  .description('Unified management of AI agent spells')
  .version('1.0.0');

program.parse(process.argv);
