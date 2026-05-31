import { Command } from 'commander';
import { readConfig, writeConfig } from '../lib/config';

export const runConfigGet = async (key: string) => {
  const config = await readConfig();
  const value = (config as any)[key];

  if (value === undefined) {
    throw new Error(`Config key '${key}' not found`);
  }

  return { key, value };
};

export const runConfigSet = async (key: string, value: string) => {
  const config = await readConfig();

  let parsedValue: any = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value))) parsedValue = Number(value);

  (config as any)[key] = parsedValue;

  await writeConfig(config);

  return { key, value: parsedValue };
};

export const registerConfig = (program: Command): void => {
  const configCmd = program.command('config').description('View and edit configuration');

  configCmd
    .command('get <key>')
    .description('Get config value')
    .action(async (key: string) => {
      try {
        const result = await runConfigGet(key);
        console.log(`\n${result.key}: ${JSON.stringify(result.value, null, 2)}\n`);
      } catch (error) {
        console.error(`\n❌ ${error instanceof Error ? error.message : error}\n`);
        process.exit(1);
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('Set config value')
    .action(async (key: string, value: string) => {
      try {
        const result = await runConfigSet(key, value);
        console.log(`\n✓ Set ${result.key} = ${JSON.stringify(result.value)}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });
};
