import * as path from 'path';
import * as fs from 'fs/promises';
import { Command } from 'commander';
import { readConfig, expandHome } from '../lib/config';
import { checkSymlinkState, SymlinkState } from '../lib/symlink';
import { ProfileService } from '../services/ProfileService';
import { ProjectService } from '../services/ProjectService';
import { runGuidanceStatus } from './sync-guidance';

interface StatusEntry {
  tool: string;
  from: string;
  to: string;
  state: SymlinkState;
}

interface ProjectStatusTarget {
  path: string;
  exists: boolean;
  count: number;
}

interface ProjectStatus {
  preset: string | null;
  presetSource: 'stored' | 'legacy' | 'none';
  inferredPreset: string | null;
  inferencePattern: string | null;
  linkedSkills: number;
  targets: ProjectStatusTarget[];
}

export const runStatus = async (): Promise<StatusEntry[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const sourceDir = expandHome(config.source);
  const entries: StatusEntry[] = [];

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }

    const toolBase = expandHome(toolConfig.configPath);

    for (const mapping of toolConfig.mappings) {
      const sourcePath = path.join(sourceDir, mapping.from);
      const targetPath = path.join(toolBase, mapping.to);
      const state = await checkSymlinkState(targetPath, sourcePath);
      entries.push({ tool: toolKey, from: mapping.from, to: mapping.to, state });
    }
  }

  return entries;
};

const countSkillEntries = async (dir: string): Promise<{ exists: boolean; names: string[] }> => {
  try {
    const entries = await fs.readdir(dir);
    return { exists: true, names: entries };
  } catch {
    return { exists: false, names: [] };
  }
};

export const runProjectStatus = async (projectPath = process.cwd()): Promise<ProjectStatus> => {
  let preset: string | null = null;
  let presetSource: ProjectStatus['presetSource'] = 'none';

  try {
    const content = await fs.readFile(path.join(projectPath, '.sync-spells.json'), 'utf8');
    const state = JSON.parse(content);
    if (state.activePreset) {
      preset = state.activePreset;
      presetSource = 'stored';
    } else if (state.activeProfile) {
      preset = state.activeProfile;
      presetSource = 'legacy';
    }
  } catch {
    preset = null;
  }

  const config = await readConfig();
  const inferred = new ProjectService(config, new ProfileService(config))
    .inferProfileMatch(projectPath);

  const targetPaths = ['.codex/skills', '.claude/skills'];
  const targets: ProjectStatusTarget[] = [];
  const skillNames = new Set<string>();

  for (const targetPath of targetPaths) {
    const result = await countSkillEntries(path.join(projectPath, targetPath));
    for (const name of result.names) {
      skillNames.add(name);
    }
    targets.push({
      path: targetPath,
      exists: result.exists,
      count: result.names.length,
    });
  }

  return {
    preset,
    presetSource,
    inferredPreset: inferred?.profile ?? null,
    inferencePattern: inferred?.patternText ?? null,
    linkedSkills: skillNames.size,
    targets,
  };
};

const formatSkillCount = (count: number): string => `${count} ${count === 1 ? 'skill' : 'skills'}`;

export const registerStatus = (program: Command): void => {
  program
    .command('status')
    .description('Show project preset status')
    .option('--verbose', 'Show global tool mapping status')
    .action(async (options?: { verbose?: boolean }) => {
      if (options?.verbose) {
        const projectStatus = await runProjectStatus();
        if (projectStatus.preset) {
          const label = projectStatus.presetSource === 'legacy' ? 'legacy activeProfile' : 'activePreset';
          console.log(`Project preset: ${projectStatus.preset} (${label})`);
        } else if (projectStatus.inferredPreset) {
          console.log('Project preset: none active');
          console.log(`Inferred preset: ${projectStatus.inferredPreset} (${projectStatus.inferencePattern})`);
        } else {
          console.log('Project preset: none active');
          console.log('Inferred preset: none');
        }

        const entries = await runStatus();
        for (const entry of entries) {
          console.log(`  [${entry.tool}] ${entry.from} → ${entry.to}: ${entry.state}`);
        }

        const guidanceEntries = await runGuidanceStatus();
        for (const entry of guidanceEntries) {
          console.log(`  [${entry.tool}] global guidance → ${entry.target}: ${entry.state}`);
        }

        if (entries.length === 0) {
          console.log('No enabled tools. Run `spells setup` to configure.');
        }
        return;
      }

      const status = await runProjectStatus();
      if (!status.preset) {
        console.log('No preset active for this project.');
        console.log('Run `spells use [preset]` to activate one.');
        return;
      }

      console.log(`Project preset: ${status.preset}`);
      console.log(`Linked skills: ${status.linkedSkills}`);
      for (const target of status.targets) {
        const state = target.exists ? 'exists' : 'missing';
        console.log(`${target.path}: ${state} (${formatSkillCount(target.count)})`);
      }
    });
};
