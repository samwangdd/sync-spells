import * as fs from 'fs/promises';
import * as path from 'path';
import { InferenceMatch, ProjectActivationResult, InferenceRule } from '../types';
import { Config, expandHome, ToolConfig } from '../lib/config';
import { ProfileNotFoundError } from '../lib/errors';
import { mergeGlobalSkills } from '../commands/sync-global';
import { ProfileService } from './ProfileService';

const DEFAULT_INFERENCE_RULES: InferenceRule[] = [
  { pattern: /Mexc/i, profile: 'mexc-code' },
  { pattern: /lifeOS|🏝️lifeOS/i, profile: 'lifeos-knowledge' },
  { pattern: /.*/, profile: 'global' }
];

/** Legacy default when no tools are configured: symlink into .claude and .codex only. */
const LEGACY_TOOLS: Record<string, ToolConfig> = {
  'claude-code': { enabled: true, configPath: '.claude', mappings: [{ from: 'global', to: 'skills' }] },
  'codex': { enabled: true, configPath: '.codex', mappings: [{ from: 'global', to: 'skills' }] },
};

/** Project-relative tool dir, e.g. '~/.kiro' -> '.kiro'. */
const projectToolDir = (configPath: string): string => path.basename(expandHome(configPath));

export class ProjectService {
  private inferenceRules: InferenceRule[];

  constructor(
    private config: Config,
    private profileSvc: ProfileService,
    inferenceRules?: InferenceRule[]
  ) {
    this.inferenceRules = inferenceRules || DEFAULT_INFERENCE_RULES;
  }

  inferProfile(projectPath: string): string | null {
    return this.inferProfileMatch(projectPath)?.profile ?? null;
  }

  inferProfileMatch(projectPath: string): InferenceMatch | null {
    const binding = this.matchProjectBinding(projectPath);
    if (binding) {
      return {
        pattern: /.*/,
        profile: binding.profile,
        patternText: `binding:${binding.path}`,
        bindingPath: binding.path,
      };
    }

    for (const rule of this.inferenceRules) {
      if (rule.pattern.test(projectPath)) {
        return { ...rule, patternText: rule.pattern.toString() };
      }
    }
    return null;
  }

  private matchProjectBinding(projectPath: string): { path: string; profile: string } | null {
    const bindings = this.config.projectBindings || [];
    const normalizedProjectPath = path.resolve(expandHome(projectPath));

    const matches = bindings
      .map(binding => ({
        path: path.resolve(expandHome(binding.path)),
        profile: binding.profile,
      }))
      .filter(binding => {
        const relative = path.relative(binding.path, normalizedProjectPath);
        return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      })
      .sort((a, b) => b.path.length - a.path.length);

    return matches[0] || null;
  }

  async activateProfile(
    projectPath: string,
    profileName: string
  ): Promise<ProjectActivationResult> {
    const profile = await this.profileSvc.getProfile(profileName);

    if (!profile) {
      throw new ProfileNotFoundError(profileName);
    }

    return this.writeActivation(projectPath, profileName, profile.skills || []);
  }

  async activateSkills(
    projectPath: string,
    profileName: string,
    skillPaths: string[]
  ): Promise<ProjectActivationResult> {
    return this.writeActivation(projectPath, profileName, skillPaths);
  }

  /** Link (or copy, for tools that can't follow symlinks) skills into every enabled tool's
   * project-local skills dir. Falls back to symlinking .claude/.codex when no tools are configured. */
  private async writeActivation(
    projectPath: string,
    profileName: string,
    skillPaths: string[]
  ): Promise<ProjectActivationResult> {
    const skills: ProjectActivationResult['skills'] = [];
    const tools = Object.keys(this.config.tools || {}).length > 0 ? this.config.tools : LEGACY_TOOLS;

    const desired = skillPaths.map((skillPath) => ({
      name: path.basename(skillPath),
      sourcePath: path.join(this.config.source, skillPath),
    }));

    for (const [toolKey, toolConfig] of Object.entries(tools)) {
      if (!toolConfig.enabled) {
        continue;
      }

      const toolDir = projectToolDir(toolConfig.configPath);

      for (const mapping of toolConfig.mappings) {
        if (mapping.from !== 'global') {
          continue;
        }

        const targetDir = path.join(projectPath, toolDir, mapping.to);
        const relTargetDir = path.join(toolDir, mapping.to);

        const results = await mergeGlobalSkills(
          this.config,
          toolKey,
          targetDir,
          desired,
          toolConfig.syncMode ?? 'symlink'
        );

        for (const result of results) {
          if (result.action === 'pruned') {
            continue;
          }
          skills.push({
            name: result.skill,
            targetPath: path.join(relTargetDir, result.skill),
            status: result.action === 'error' ? 'error' : result.action === 'skipped' ? 'skipped' : 'linked',
            ...(result.error ? { error: result.error } : {}),
          });
        }
      }
    }

    try {
      await fs.writeFile(
        path.join(projectPath, '.sync-spells.json'),
        JSON.stringify({ activePreset: profileName, activeProfile: profileName }, null, 2),
        'utf8'
      );
    } catch {
      // State is helpful for status, but linking results should remain the source of truth.
    }

    return { projectPath, profile: profileName, skills };
  }

  async getActiveProfile(projectPath: string): Promise<string | null> {
    const stateFile = path.join(projectPath, '.sync-spells.json');

    try {
      const content = await fs.readFile(stateFile, 'utf8');
      const state = JSON.parse(content);
      return state.activePreset || state.activeProfile || null;
    } catch {
      return null;
    }
  }
}
