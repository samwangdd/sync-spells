import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectActivationResult, InferenceRule } from '../types';
import { Config } from '../lib/config';
import { ProfileNotFoundError } from '../lib/errors';
import { ProfileService } from './ProfileService';

const DEFAULT_INFERENCE_RULES: InferenceRule[] = [
  { pattern: /Mexc/i, profile: 'mexc-code' },
  { pattern: /lifeOS|🏝️lifeOS/i, profile: 'lifeos-knowledge' },
  { pattern: /.*/, profile: 'global-lite' }
];

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
    for (const rule of this.inferenceRules) {
      if (rule.pattern.test(projectPath)) {
        return rule.profile;
      }
    }
    return null;
  }

  async activateProfile(
    projectPath: string,
    profileName: string
  ): Promise<ProjectActivationResult> {
    const profile = await this.profileSvc.getProfile(profileName);

    if (!profile) {
      throw new ProfileNotFoundError(profileName);
    }

    const skills: ProjectActivationResult['skills'] = [];

    for (const tool of ['.claude', '.codex']) {
      const toolSkillsDir = path.join(projectPath, tool, 'skills');

      for (const skillPath of profile.skills) {
        const skillName = path.basename(skillPath);
        const sourceLink = path.join(this.config.source, skillPath);
        const targetLink = path.join(toolSkillsDir, skillName);

        try {
          await fs.mkdir(toolSkillsDir, { recursive: true });
          try { await fs.unlink(targetLink); } catch {}
          await fs.symlink(sourceLink, targetLink);
          skills.push({ name: skillName, targetPath: path.join(tool, 'skills', skillName), status: 'linked' });
        } catch (error) {
          skills.push({
            name: skillName,
            targetPath: path.join(tool, 'skills', skillName),
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
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

    return {
      projectPath,
      profile: profileName,
      skills
    };
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
