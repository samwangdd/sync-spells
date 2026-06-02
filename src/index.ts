import { Command } from 'commander';
import { registerSetup } from './commands/setup';
import { registerPush } from './commands/push';
import { registerSync } from './commands/sync';
import { registerStatus } from './commands/status';
import { registerProfiles } from './commands/profiles';
import { registerPresets } from './commands/presets';
import { registerUse } from './commands/use';
import { registerSkill } from './commands/skill';
import { registerDoctor } from './commands/doctor';
import { registerConfig } from './commands/config';
import { registerResolve } from './commands/resolve';
import { registerMigrate } from './commands/migrate';
import { registerBind } from './commands/bind';
import { registerWorkspace } from './commands/workspace';
import { readConfig } from './lib/config';

const program = new Command();

program
  .name('spells')
  .description('Unified management of AI agent spells')
  .version('2.0.0');

registerSetup(program);
registerPush(program);
registerSync(program);
registerStatus(program);
registerProfiles(program, readConfig);
registerPresets(program, readConfig);
registerUse(program, readConfig);
registerSkill(program, readConfig);
registerDoctor(program, readConfig);
registerConfig(program);
registerResolve(program, readConfig);
registerMigrate(program, readConfig);
registerBind(program);
registerWorkspace(program, readConfig);

program.parse(process.argv);
