export interface Profile {
  name: string;
  description?: string;
  categories?: string[];
  extras?: string[];
  excludes?: string[];
  extends?: string | null;
  skills?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SkillInfo {
  path: string;
  category: SkillCategory;
  name: string;
  hasSkillMd: boolean;
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

export type SkillCategory = string;

export interface InferenceRule {
  pattern: RegExp;
  profile: string;
}

export interface InferenceMatch extends InferenceRule {
  patternText: string;
  bindingPath?: string;
}

export interface ProjectBinding {
  path: string;
  profile: string;
}
