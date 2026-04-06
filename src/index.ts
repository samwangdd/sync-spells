import { Command } from 'commander';
import { registerSetup } from './commands/setup';
import { registerPush } from './commands/push';
import { registerSync } from './commands/sync';
import { registerStatus } from './commands/status';

const program = new Command();

program
  .name('spells')
  .description('Unified management of AI agent spells')
  .version('1.0.0');

registerSetup(program);
registerPush(program);
registerSync(program);
registerStatus(program);

program.parse(process.argv);
