import * as fs from 'fs/promises';
import { Command } from 'commander';
import { writeConfig, Config, ToolConfig } from '../lib/config';
import { TOOL_PRESETS, presetToToolConfig } from './tool-presets';

export const runSetup = async (
  sourceDir: string,
  selectedTools: string[],
): Promise<Config> => {
  await fs.mkdir(sourceDir, { recursive: true });

  const tools: Record<string, ToolConfig> = {};
  for (const key of selectedTools) {
    const preset = TOOL_PRESETS.find((p) => p.key === key);
    if (preset) {
      tools[key] = presetToToolConfig(preset);
    }
  }

  const config: Config = { source: sourceDir, tools };
  await writeConfig(config);
  return config;
};

export const registerSetup = (program: Command): void => {
  program
    .command('setup')
    .description('Initialize sync-spells configuration')
    .action(async () => {
      const { input, checkbox } = await import('@inquirer/prompts');
      const sourceDir = await input({
        message: 'Source directory for spells:',
        default: '~/spells',
      });
      const expandedSource = sourceDir.startsWith('~/')
        ? sourceDir.replace('~', process.env.HOME || '')
        : sourceDir;

      const selectedLabels = await checkbox({
        message: 'Select tools to enable:',
        choices: TOOL_PRESETS.map((p) => ({ name: p.label, value: p.key })),
      });

      const config = await runSetup(expandedSource, selectedLabels);
      console.log(`Setup complete. Source: ${config.source}`);
      console.log(`Enabled tools: ${Object.keys(config.tools).join(', ')}`);
    });
};
