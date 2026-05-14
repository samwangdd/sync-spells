import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectActivationResult, InferenceRule } from '../types';
import { Config } from '../lib/config';
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
      throw new Error(`Profile not found: ${profileName}`);
    }

    const activeDir = this.config.activeDir ||
      path.join(this.config.source, 'active-skills');
    const profileActiveDir = path.join(activeDir, profileName);

    const skills: ProjectActivationResult['skills'] = [];

    for (const tool of ['.claude', '.codex']) {
      const toolSkillsDir = path.join(projectPath, tool, 'skills');

      for (const skillPath of profile.skills) {
        const skillName = path.basename(skillPath);
        const sourceLink = path.join(profileActiveDir, skillName);
        const targetLink = path.join(toolSkillsDir, skillName);

        try {
          await fs.mkdir(toolSkillsDir, { recursive: true });

          try {
            await fs.unlink(targetLink);
          } catch {}

          await fs.symlink(sourceLink, targetLink);

          skills.push({
            name: skillName,
            targetPath: path.join(tool, 'skills', skillName),
            status: 'linked'
          });
        } catch (error) {
          skills.push({
            name: skillName,
            targetPath: path.join(tool, 'skills', skillName),
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
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
      return state.activeProfile || null;
    } catch {
      return null;
    }
  }
}
