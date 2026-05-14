import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { ProfileNotFoundError } from '../lib/errors';
import { Profile, ValidationResult } from '../types';

const isProfile = (value: unknown): value is Profile => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Partial<Profile>;
  return typeof obj.name === 'string' && Array.isArray(obj.skills);
};

export class ProfileService {
  constructor(private config: Config) {}

  async listProfiles(): Promise<Profile[]> {
    const profilesDir = this.config.profilesDir || path.join(this.config.source, 'profiles');

    try {
      await fs.access(profilesDir);
    } catch {
      return [];
    }

    const files = await fs.readdir(profilesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const profiles: Profile[] = [];

    for (const file of jsonFiles) {
      const filePath = path.join(profilesDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(content);
      if (!isProfile(parsed)) continue;
      profiles.push(parsed);
    }

    return profiles;
  }

  async getProfile(name: string): Promise<Profile | null> {
    const profiles = await this.listProfiles();
    return profiles.find(p => p.name === name) || null;
  }

  async validateProfile(profile: Profile): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!profile.name || profile.name.trim() === '') {
      errors.push('Profile name is required');
    }

    if (!profile.skills || profile.skills.length === 0) {
      warnings.push('Profile has no skills');
    }

    const registryDir = this.config.source;

    for (const skillPath of profile.skills || []) {
      const fullPath = path.join(registryDir, skillPath);
      try {
        await fs.access(fullPath);
      } catch {
        warnings.push(`Skill path does not exist: ${skillPath}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  async getDefaultProfile(): Promise<Profile> {
    const defaultName = this.config.defaultProfile || 'global-lite';
    const profile = await this.getProfile(defaultName);

    if (!profile) {
      throw new ProfileNotFoundError(defaultName);
    }

    return profile;
  }
}
