export interface Profile {
  name: string;
  description?: string;
  skills: string[];
  extends?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SkillInfo {
  path: string;
  category: 'global' | 'code' | 'lifeos' | 'inbox';
  name: string;
  hasSkillMd: boolean;
}

export interface MaterializeResult {
  profile: string;
  generatedAt: string;
  skills: {
    path: string;
    symlinkPath: string;
    status: 'created' | 'updated' | 'error';
    error?: string;
  }[];
}

export interface ProjectActivationResult {
  projectPath: string;
  profile: string;
  skills: {
    name: string;
    targetPath: string;
    status: 'linked' | 'skipped' | 'error';
    error?: string;
  }[];
}

export type SkillCategory = 'global' | 'code' | 'lifeos' | 'inbox';

export interface InferenceRule {
  pattern: RegExp;
  profile: string;
}
