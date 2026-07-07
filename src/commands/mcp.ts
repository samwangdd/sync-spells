import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import { Config, configDir, expandHome, readConfig } from '../lib/config';
import { McpChange, McpServerConfig, McpToolKey } from '../types/mcp';
import { McpManifestService } from '../services/McpManifestService';
import { McpRegistryService } from '../services/McpRegistryService';
import { McpTargetService } from '../services/McpTargetService';
import { ProjectService } from '../services/ProjectService';
import { ProfileService } from '../services/ProfileService';

interface McpRunOptions {
  dryRun: boolean;
  forceAdopt: boolean;
  manifestPath?: string;
}

interface McpRunResult {
  preset?: string;
  changes: McpChange[];
}

const enabledMcpTools = (config: Config): McpToolKey[] => {
  return (['claude-code', 'cursor', 'codex', 'kiro'] as McpToolKey[]).filter((tool) => config.tools[tool]?.enabled);
};

const manifestPathFor = (options: McpRunOptions): string => options.manifestPath || path.join(configDir(), 'mcp-manifest.json');

const globalTargetPath = (config: Config, tool: McpToolKey): string => {
  const configured = expandHome(config.tools[tool].configPath);

  if (tool === 'claude-code') return `${configured}.json`;
  if (tool === 'cursor') return path.join(configured, 'mcp.json');
  if (tool === 'kiro') return path.join(configured, 'settings', 'mcp.json');

  return path.join(configured, 'config.toml');
};

const projectTargetPath = (projectPath: string, tool: McpToolKey): string => {
  if (tool === 'claude-code') return path.join(projectPath, '.mcp.json');
  if (tool === 'cursor') return path.join(projectPath, '.cursor', 'mcp.json');
  if (tool === 'kiro') return path.join(projectPath, '.kiro', 'settings', 'mcp.json');

  return path.join(projectPath, '.codex', 'config.toml');
};

const writeTargets = async (
  config: Config,
  scope: 'global' | 'project',
  basePath: string,
  servers: Record<string, McpServerConfig>,
  options: McpRunOptions
): Promise<McpChange[]> => {
  const manifest = new McpManifestService(manifestPathFor(options));
  const targetService = new McpTargetService(manifest);
  const changes: McpChange[] = [];

  for (const tool of enabledMcpTools(config)) {
    const targetPath = scope === 'global' ? globalTargetPath(config, tool) : projectTargetPath(basePath, tool);
    const next =
      tool === 'codex'
        ? await targetService.writeCodexTarget({
            tool,
            scope,
            targetPath,
            servers,
            dryRun: options.dryRun,
            forceAdopt: options.forceAdopt
          })
        : await targetService.writeJsonTarget({
            tool,
            scope,
            targetPath,
            servers,
            dryRun: options.dryRun,
            forceAdopt: options.forceAdopt
          });

    changes.push(...next);
  }

  return changes;
};

export const runMcpGlobalSync = async (config: Config, options: McpRunOptions): Promise<McpRunResult> => {
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const loaded = await new McpRegistryService(expandHome(config.source)).loadGlobal();
  const changes = await writeTargets(config, 'global', '', loaded.servers, options);

  return { changes };
};

export const runMcpUse = async (
  config: Config,
  projectPath: string,
  preset: string | undefined,
  options: McpRunOptions
): Promise<McpRunResult> => {
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);
  const finalPreset = preset || projectSvc.inferProfile(projectPath) || 'global';
  const loaded = await new McpRegistryService(expandHome(config.source)).loadForPreset(finalPreset);
  const changes = await writeTargets(config, 'project', projectPath, loaded.servers, options);

  if (!options.dryRun && !changes.some((change) => change.action === 'conflict')) {
    let state: Record<string, unknown> = {};

    try {
      state = JSON.parse(await fs.readFile(path.join(projectPath, '.sync-spells.json'), 'utf8'));
    } catch {}

    state.activeMcpPreset = finalPreset;
    await fs.writeFile(path.join(projectPath, '.sync-spells.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  return { preset: finalPreset, changes };
};

export const runMcpStatus = async (config: Config, projectPath: string) => {
  const source = expandHome(config.source || '');
  const registryDir = path.join(source, 'mcp-registry');
  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);
  let presets: string[] = [];

  try {
    presets = (await fs.readdir(path.join(registryDir, 'presets')))
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.basename(name, '.json'))
      .sort();
  } catch {}

  let activeMcpPreset: string | null = null;

  try {
    const state = JSON.parse(await fs.readFile(path.join(projectPath, '.sync-spells.json'), 'utf8'));
    activeMcpPreset = typeof state.activeMcpPreset === 'string' ? state.activeMcpPreset : null;
  } catch {}

  return {
    activeMcpPreset,
    inferredPreset: projectSvc.inferProfile(projectPath),
    registry: {
      global: await fs.access(path.join(registryDir, 'global.json')).then(() => true).catch(() => false),
      presets
    },
    enabledTools: enabledMcpTools(config)
  };
};

const printChanges = (changes: McpChange[]): void => {
  for (const change of changes) {
    console.log(`  ${change.action} [${change.tool}:${change.scope}] ${change.server} -> ${change.targetPath}`);
  }
};

export const registerMcp = (program: Command): void => {
  const mcp = program.command('mcp').description('Manage MCP server configuration');

  mcp
    .command('status')
    .description('Show MCP registry and project status')
    .action(async () => {
      const status = await runMcpStatus(await readConfig(), process.cwd());
      console.log(`Active MCP preset: ${status.activeMcpPreset || '-'}`);
      console.log(`Inferred preset: ${status.inferredPreset || '-'}`);
      console.log(`Global registry: ${status.registry.global ? 'yes' : 'no'}`);
      console.log(`Preset registries: ${status.registry.presets.join(', ') || '-'}`);
      console.log(`Enabled tools: ${status.enabledTools.join(', ') || '-'}`);
    });

  mcp
    .command('sync')
    .option('--global', 'sync global MCP config')
    .option('--dry-run', 'show changes without writing')
    .option('--force-adopt', 'adopt conflicting existing entries')
    .description('Sync MCP server config')
    .action(async (options: { global?: boolean; dryRun?: boolean; forceAdopt?: boolean }) => {
      if (!options.global) {
        throw new Error('Only `spells mcp sync --global` is supported.');
      }

      const result = await runMcpGlobalSync(await readConfig(), {
        dryRun: Boolean(options.dryRun),
        forceAdopt: Boolean(options.forceAdopt)
      });
      printChanges(result.changes);
    });

  mcp
    .command('use [preset]')
    .option('--dry-run', 'show changes without writing')
    .option('--force-adopt', 'adopt conflicting existing entries')
    .description('Activate project MCP config')
    .action(async (preset: string | undefined, options: { dryRun?: boolean; forceAdopt?: boolean }) => {
      const result = await runMcpUse(await readConfig(), process.cwd(), preset, {
        dryRun: Boolean(options.dryRun),
        forceAdopt: Boolean(options.forceAdopt)
      });
      console.log(`MCP preset: ${result.preset}`);
      printChanges(result.changes);
    });
};
