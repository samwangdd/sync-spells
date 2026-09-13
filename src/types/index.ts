export interface DormantExclude {
  /** Full ref, e.g. "coding/some-idle-skill". */
  skill: string;
  /** ISO date the audit recorded this exclusion (YYYY-MM-DD). */
  since: string;
  /** Lookback window in days used by the audit that produced this record. */
  window: number;
  /** Hit count observed over that window (0 for a confirmed-idle skill). */
  hits: number;
}

export interface Profile {
  name: string;
  description?: string;
  categories?: string[];
  extras?: string[];
  excludes?: string[];
  /**
   * Idle-audit-sourced exclusions, distinct from `excludes` (a human's standing
   * decision). Same exclusion effect when resolving, different provenance and
   * lifecycle: written and removed only after per-profile human confirmation,
   * never auto-applied. See docs/superpowers/adr for the split rationale.
   */
  dormantExcludes?: DormantExclude[];
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

export interface SourceSkillEntry {
  path: string;
  category: string;
  global?: boolean;
}

export interface SourceSpec {
  name: string;
  repo: string;
  cache?: string;
  skills: SourceSkillEntry[];
}

export interface SourcesConfig {
  sources: SourceSpec[];
}
