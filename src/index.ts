import { Command } from 'commander';
import { registerSetup } from './commands/setup';
import { registerPush } from './commands/push';
import { registerSync } from './commands/sync';
import { registerStatus } from './commands/status';
import { registerProfiles } from './commands/profiles';
import { registerUse } from './commands/use';
import { registerSkill } from './commands/skill';
import { registerMaterialize } from './commands/materialize';
import { registerDoctor } from './commands/doctor';
import { readConfig } from './lib/config';

const program = new Command();

program
  .name('spells')
  .description('Unified management of AI agent spells')
  .version('1.0.0');

registerSetup(program);
registerPush(program);
registerSync(program);
registerStatus(program);
registerProfiles(program, readConfig);
registerUse(program, readConfig);
registerSkill(program, readConfig);
registerMaterialize(program, readConfig);
registerDoctor(program, readConfig);

program.parse(process.argv);
