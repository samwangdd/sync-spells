import * as fs from 'fs/promises';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Config, expandHome } from '../lib/config';
import { SourcesConfig, SourceSpec, SourceSkillEntry } from '../types';
import { SkillService } from './SkillService';

export interface SyncedSkillResult {
  /** Source-relative path inside the cache, e.g. skills/engineering/tdd */
  source: string;
  /** Registry-relative target, e.g. coding/tdd */
  target: string;
  /** Whether the target SKILL.md already existed (kept untouched) */
  existed: boolean;
  /** Whether this skill was (newly) added to global.json extras */
  addedToGlobal: boolean;
}

export interface SyncedSourceResult {
  name: string;
  repo: string;
  cache: string;
  /** clone | pull | cached */
  action: 'clone' | 'pull' | 'cached';
  skills: SyncedSkillResult[];
}

export interface SyncSummary {
  sources: SyncedSourceResult[];
}

export class SourceService {
  constructor(private config: Config) {}

  private sourcesConfigPath(): string {
    return path.join(this.config.source, 'sources.json');
  }

  private profilesDir(): string {
    return this.config.profilesDir || path.join(this.config.source, 'profiles');
  }

  async readSourcesConfig(): Promise<SourcesConfig> {
    const configPath = this.sourcesConfigPath();
    let raw: string;
    try {
      raw = await fs.readFile(configPath, 'utf8');
    } catch {
      throw new Error(`sources.json not found at ${configPath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Failed to parse sources.json at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as SourcesConfig).sources)
    ) {
      throw new Error(`Invalid sources.json at ${configPath}: missing "sources" array`);
    }

    return parsed as SourcesConfig;
  }

  async syncSources(name?: string, opts?: { update?: boolean }): Promise<SyncSummary> {
    const sourcesConfig = await this.readSourcesConfig();

    const targets = name
      ? sourcesConfig.sources.filter(s => s.name === name)
      : sourcesConfig.sources;

    if (name && targets.length === 0) {
      throw new Error(`Source not found in sources.json: ${name}`);
    }

    const skillSvc = new SkillService(this.config);
    const summary: SyncSummary = { sources: [] };

    for (const source of targets) {
      const cache = expandHome(
        source.cache ?? path.join(this.config.source, '.vendor', source.name)
      );

      const action = await this.ensureCache(source, cache, opts?.update === true);

      const skillResults: SyncedSkillResult[] = [];
      const globalToAdd: string[] = [];

      for (const skill of source.skills) {
        const skillName = path.basename(skill.path);
        const target = `${skill.category}/${skillName}`;
        const targetSkillMd = path.join(this.config.source, skill.category, skillName, 'SKILL.md');

        const existed = await this.fileExists(targetSkillMd);

        await skillSvc.addSkill(path.join(cache, skill.path), target);

        const isGlobal = skill.global === true;
        if (isGlobal) {
          globalToAdd.push(target);
        }

        skillResults.push({
          source: skill.path,
          target,
          existed,
          addedToGlobal: false // patched below for entries newly merged
        });
      }

      const newlyAdded = await this.mergeGlobalExtras(globalToAdd);

      for (const result of skillResults) {
        if (newlyAdded.includes(result.target)) {
          result.addedToGlobal = true;
        }
      }

      summary.sources.push({
        name: source.name,
        repo: source.repo,
        cache,
        action,
        skills: skillResults
      });
    }

    return summary;
  }

  private async ensureCache(
    source: SourceSpec,
    cache: string,
    update: boolean
  ): Promise<'clone' | 'pull' | 'cached'> {
    const exists = await this.fileExists(cache);

    if (!exists) {
      await fs.mkdir(path.dirname(cache), { recursive: true });
      execFileSync('git', ['clone', source.repo, cache], { stdio: 'pipe' });
      return 'clone';
    }

    if (update) {
      execFileSync('git', ['-C', cache, 'pull'], { stdio: 'pipe' });
      return 'pull';
    }

    return 'cached';
  }

  /**
   * Merge the given "<category>/<name>" entries into global.json `extras`,
   * deduping against existing entries. Returns the entries that were newly added.
   * Writes back with 2-space indent + trailing newline.
   */
  private async mergeGlobalExtras(entries: string[]): Promise<string[]> {
    if (entries.length === 0) {
      return [];
    }

    const globalPath = path.join(this.profilesDir(), 'global.json');

    let raw: string;
    try {
      raw = await fs.readFile(globalPath, 'utf8');
    } catch {
      throw new Error(`global profile not found at ${globalPath}`);
    }

    const profile = JSON.parse(raw) as { extras?: string[]; [key: string]: unknown };
    const extras = Array.isArray(profile.extras) ? profile.extras : [];
    const existing = new Set(extras);

    const newlyAdded: string[] = [];
    for (const entry of entries) {
      if (!existing.has(entry)) {
        extras.push(entry);
        existing.add(entry);
        newlyAdded.push(entry);
      }
    }

    if (newlyAdded.length > 0) {
      profile.extras = extras;
      await fs.writeFile(globalPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    }

    return newlyAdded;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export type { SourceSkillEntry };
