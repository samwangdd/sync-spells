import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, expandHome } from '../lib/config';
import { checkSymlinkState } from '../lib/symlink';
import { defaultManifest, manifestPath, readManifest, writeManifest } from '../lib/workspace';
import { listAgentFiles, parseAgentFile } from '../lib/agent';

/**
 * The workspace root is the parent of `config.source`. By repo convention
 * `config.source` points at the skill library directory (e.g. `<root>/skill-category`,
 * whose direct children are the categories), so the managed workspace — which also
 * holds `profiles/` and `agents/` as siblings of the library — is one level up.
 */
export const workspaceRoot = (config: Config): string =>
  path.dirname(expandHome(config.source));

export interface WorkspaceInitResult {
  root: string;
  action: 'created' | 'unchanged';
}

export const runWorkspaceInit = async (root: string): Promise<WorkspaceInitResult> => {
  try {
    await fs.access(manifestPath(root));
    return { root, action: 'unchanged' };
  } catch {
    await writeManifest(root, { ...defaultManifest });
    return { root, action: 'created' };
  }
};

export interface WorkspaceDoctorResult {
  check: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export const runWorkspaceDoctor = async (
  config: Config,
  root: string,
): Promise<WorkspaceDoctorResult[]> => {
  const results: WorkspaceDoctorResult[] = [];
  const manifest = await readManifest(root);

  for (const dir of [manifest.library, manifest.profiles, manifest.agents]) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
      results.push({ check: `dir:${dir}`, status: 'ok', message: `directory exists: ${dir}` });
    } catch {
      results.push({ check: `dir:${dir}`, status: 'error', message: `missing directory: ${dir}` });
    }
  }

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }
    const toolBase = expandHome(toolConfig.configPath);
    for (const mapping of toolConfig.mappings) {
      const expected = path.join(expandHome(config.source), mapping.from);
      const target = path.join(toolBase, mapping.to);
      const state = await checkSymlinkState(target, expected);
      if (state === 'broken' || state === 'wrong-target') {
        results.push({
          check: `symlink:${toolKey}:${mapping.to}`,
          status: 'error',
          message: `symlink ${target} is ${state} (expected → ${expected}); run "spells sync" to repair`,
        });
      } else {
        results.push({
          check: `symlink:${toolKey}:${mapping.to}`,
          status: 'ok',
          message: `symlink ${toolKey}:${mapping.to} is ${state}`,
        });
      }
    }
  }

  // Agent passthrough symlink health. Only md-format tools symlink agent files
  // (toml/json tools generate real files, so symlink state does not apply).
  const agentFiles = await listAgentFiles(path.join(root, manifest.agents));
  const parsedAgents: { file: string; name: string }[] = [];
  for (const file of agentFiles) {
    try {
      parsedAgents.push({ file, name: parseAgentFile(await fs.readFile(file, 'utf8')).data.name });
    } catch {
      results.push({
        check: `agent:source:${path.basename(file)}`,
        status: 'error',
        message: `cannot parse agent ${file}; fix its frontmatter`,
      });
    }
  }

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled || !toolConfig.agents || toolConfig.agents.format !== 'md') {
      continue;
    }
    const targetDir = expandHome(toolConfig.agents.path);
    for (const { file, name } of parsedAgents) {
      const target = path.join(targetDir, `${name}.md`);
      const state = await checkSymlinkState(target, file);
      if (state === 'broken' || state === 'wrong-target') {
        results.push({
          check: `agent:${toolKey}:${name}`,
          status: 'error',
          message: `agent symlink ${target} is ${state} (expected → ${file}); run "spells sync" to repair`,
        });
      } else {
        results.push({
          check: `agent:${toolKey}:${name}`,
          status: 'ok',
          message: `agent symlink ${toolKey}:${name} is ${state}`,
        });
      }
    }
  }

  return results;
};

export interface WorkspaceMigrateResult {
  root: string;
  created: string[];
}

export const runWorkspaceMigrate = async (root: string): Promise<WorkspaceMigrateResult> => {
  const manifest = await readManifest(root);
  const created: string[] = [];

  for (const dir of [manifest.library, manifest.profiles, manifest.agents]) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
    } catch {
      await fs.mkdir(full, { recursive: true });
      created.push(dir);
    }
  }

  return { root, created: created.sort() };
};

export const registerWorkspace = (program: Command, getConfig: () => Promise<Config>): void => {
  const ws = program.command('workspace').description('Manage the iCloud sync-spells workspace');

  ws.command('init')
    .description('Write workspace.json into the configured workspace root')
    .action(async () => {
      const config = await getConfig();
      const root = workspaceRoot(config);
      const result = await runWorkspaceInit(root);
      console.log(`  ${result.action === 'created' ? '+' : '='} workspace.json: ${result.action} (${result.root})`);
    });

  ws.command('doctor')
    .description('Validate workspace directories and tool symlink health')
    .action(async () => {
      const config = await getConfig();
      const root = workspaceRoot(config);
      const results = await runWorkspaceDoctor(config, root);
      for (const r of results) {
        const icon = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
        console.log(`  ${icon} ${r.message}`);
      }
      const hasErrors = results.some((r) => r.status === 'error');
      console.log(`\n${hasErrors ? '✗ Workspace issues found' : '✓ Workspace healthy'}\n`);
    });

  ws.command('migrate')
    .description('Create any missing manifest-declared directories')
    .action(async () => {
      const config = await getConfig();
      const root = workspaceRoot(config);
      const result = await runWorkspaceMigrate(root);
      if (result.created.length === 0) {
        console.log('  = workspace already conforms to manifest');
      } else {
        for (const dir of result.created) {
          console.log(`  + created ${dir}`);
        }
      }
    });
};
