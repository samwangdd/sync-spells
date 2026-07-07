import * as fs from 'fs/promises';
import * as path from 'path';
import { readConfig, expandHome, AgentFormat } from '../lib/config';
import { checkSymlinkState, createSymlink, removeSymlink } from '../lib/symlink';
import { backupPath } from '../lib/backup';
import { readManifest } from '../lib/workspace';
import { listAgentFiles, parseAgentFile, toToml, toJson } from '../lib/agent';

export interface AgentSyncResult {
  tool: string;
  agent: string;
  format: AgentFormat;
  action: 'linked' | 'skipped' | 'written' | 'backed-up' | 're-linked';
}

const renderAgent = (
  format: AgentFormat,
  data: ReturnType<typeof parseAgentFile>['data'],
  body: string,
): string => (format === 'toml' ? toToml(data, body) : toJson(data, body));

const resolveAgentsDir = async (sourceRoot: string): Promise<string> => {
  const manifest = await readManifest(sourceRoot);
  const direct = path.join(sourceRoot, manifest.agents);
  try {
    await fs.access(direct);
    return direct;
  } catch {}

  if (path.basename(sourceRoot) === manifest.library) {
    const workspaceRoot = path.dirname(sourceRoot);
    const workspaceManifest = await readManifest(workspaceRoot);
    const sibling = path.join(workspaceRoot, workspaceManifest.agents);
    try {
      await fs.access(sibling);
      return sibling;
    } catch {}
  }

  return direct;
};

export const runAgentSync = async (): Promise<AgentSyncResult[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const root = expandHome(config.source);
  const agentsDir = await resolveAgentsDir(root);
  const files = await listAgentFiles(agentsDir);
  const results: AgentSyncResult[] = [];

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled || !toolConfig.agents) {
      continue;
    }

    const targetDir = expandHome(toolConfig.agents.path);
    const format = toolConfig.agents.format;
    await fs.mkdir(targetDir, { recursive: true });

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const { data, body } = parseAgentFile(content);
      const target = path.join(targetDir, `${data.name}.${format}`);

      if (format === 'md') {
        const state = await checkSymlinkState(target, file);
        switch (state) {
          case 'linked':
            results.push({ tool: toolKey, agent: data.name, format, action: 'skipped' });
            break;
          case 'missing':
            await createSymlink(file, target);
            results.push({ tool: toolKey, agent: data.name, format, action: 'linked' });
            break;
          case 'real-dir':
            await backupPath(target);
            await fs.rm(target, { recursive: true, force: true });
            await createSymlink(file, target);
            results.push({ tool: toolKey, agent: data.name, format, action: 'backed-up' });
            break;
          case 'broken':
          case 'wrong-target':
            await removeSymlink(target);
            await createSymlink(file, target);
            results.push({ tool: toolKey, agent: data.name, format, action: 're-linked' });
            break;
        }
      } else {
        const rendered = renderAgent(format, data, body);
        let action: AgentSyncResult['action'] = 'written';
        try {
          const stats = await fs.lstat(target);
          if (stats.isSymbolicLink()) {
            await fs.unlink(target);
            action = 'written';
          } else {
            await backupPath(target);
            if (stats.isDirectory()) {
              await fs.rm(target, { recursive: true, force: true });
            }
            action = 'backed-up';
          }
        } catch {
          action = 'written';
        }
        await fs.writeFile(target, rendered, 'utf8');
        results.push({ tool: toolKey, agent: data.name, format, action });
      }
    }
  }

  return results;
};
