import * as fs from 'fs/promises';
import * as path from 'path';
import { MaterializeResult } from '../types';
import { Config } from '../lib/config';
import { ProfileService } from './ProfileService';

export class MaterializeService {
  constructor(
    private config: Config,
    private profileSvc: ProfileService
  ) {}

  async materialize(profileName: string): Promise<MaterializeResult> {
    const profile = await this.profileSvc.getProfile(profileName);

    if (!profile) {
      throw new Error(`Profile not found: ${profileName}`);
    }

    const activeDir = this.config.activeDir ||
      path.join(this.config.source, 'active-skills');
    const profileActiveDir = path.join(activeDir, profileName);

    await fs.mkdir(profileActiveDir, { recursive: true });

    const skills: MaterializeResult['skills'] = [];

    for (const skillPath of profile.skills) {
      const sourcePath = path.join(this.config.source, skillPath);
      const skillName = path.basename(skillPath);
      const linkPath = path.join(profileActiveDir, skillName);

      try {
        await fs.access(sourcePath);

        // Remove existing link if present
        try {
          await fs.unlink(linkPath);
        } catch {}

        await fs.symlink(sourcePath, linkPath);

        skills.push({
          path: skillPath,
          symlinkPath: linkPath,
          status: 'created'
        });
      } catch (error) {
        skills.push({
          path: skillPath,
          symlinkPath: linkPath,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      profile: profileName,
      generatedAt: new Date().toISOString(),
      skills
    };
  }

  async cleanup(profileName: string): Promise<void> {
    const activeDir = this.config.activeDir ||
      path.join(this.config.source, 'active-skills');
    const profileActiveDir = path.join(activeDir, profileName);

    await fs.rm(profileActiveDir, { recursive: true, force: true });
  }
}
