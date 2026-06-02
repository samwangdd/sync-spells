import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';

export interface MigrateReport {
  dryRun: boolean;
  backupDir: string | null;
  movedDirs: { from: string; to: string }[];
  removedDirs: string[];
  convertedProfiles: string[];
  notes: string[];
}

/**
 * Map an old registry-relative path (e.g. "domains/frontend/web-perf") to its
 * new registry-relative path (e.g. "coding/web-perf").
 *
 * Returns null when the path is unchanged / should not be moved (global/*).
 */
export function mapOldToNew(oldPath: string): string | null {
  const parts = oldPath.split('/');
  if (parts.length < 2) return null;

  const [top, sub, skill] = parts;

  // ── unchanged categories ──────────────────────────────────────────────────
  if (top === 'global') {
    return null;
  }

  if (top === 'external') return `workflow/${sub}`;
  if (top === 'inbox') return null;

  // ── domains/* ────────────────────────────────────────────────────────────
  if (top === 'domains') {
    if (!skill) return null; // only 2-segment path (the container itself) — handled elsewhere
    if (sub === 'lark') return `workflow/${skill}`;
    // frontend, figma, and any other domain → coding
    return `coding/${skill}`;
  }

  // ── workflows/* ──────────────────────────────────────────────────────────
  if (top === 'workflows') {
    return `workflow/${sub}`; // sub is the skill name here
  }

  // ── projects/* ───────────────────────────────────────────────────────────
  if (top === 'projects') {
    if (!skill) return null;
    if (sub === 'omf' || sub === 'lifeos') {
      // special case: lifeos/llm-wiki → knowledge
      if (sub === 'lifeos' && skill === 'llm-wiki') return `knowledge/${skill}`;
      return `workflow/${skill}`;
    }
    if (sub === 'mexc') return `coding/${skill}`;
    // unknown project — default to coding
    return `coding/${skill}`;
  }

  return null;
}

const PROFILE_CATEGORY_PRESETS: Record<string, string[]> = {
  all: ['coding', 'knowledge', 'workflow'],
  'mexc-code': ['coding'],
  'lifeos-knowledge': ['knowledge', 'workflow'],
};

const applyProfileCategoryPreset = (
  profileName: string,
  extras: string[]
): { categories?: string[]; extras: string[] } => {
  const categories = PROFILE_CATEGORY_PRESETS[profileName];
  if (!categories) return { extras };

  const categorySet = new Set(categories);
  return {
    categories,
    extras: extras.filter(
      (skillPath) => !categorySet.has(skillPath.split('/')[0] ?? '')
    ),
  };
};

/**
 * Old top-level containers that get restructured. Each entry is
 * { oldContainer, newCategory } for every mapped domain/project variant.
 * We enumerate them so we can scan children efficiently.
 */
const MIGRATION_CONTAINERS: { container: string; mapChild: (child: string) => string | null }[] = [
  // domains/frontend/<skill> → coding/<skill>
  {
    container: 'domains/frontend',
    mapChild: (skill) => `coding/${skill}`,
  },
  // domains/figma/<skill> → coding/<skill>
  {
    container: 'domains/figma',
    mapChild: (skill) => `coding/${skill}`,
  },
  // domains/lark/<skill> → workflow/<skill>
  {
    container: 'domains/lark',
    mapChild: (skill) => `workflow/${skill}`,
  },
  // workflows/<skill> → workflow/<skill>
  {
    container: 'workflows',
    mapChild: (skill) => `workflow/${skill}`,
  },
  // projects/omf/<skill> → workflow/<skill>
  {
    container: 'projects/omf',
    mapChild: (skill) => `workflow/${skill}`,
  },
  // projects/lifeos/<skill> → workflow/<skill>  (except llm-wiki → knowledge)
  {
    container: 'projects/lifeos',
    mapChild: (skill) =>
      skill === 'llm-wiki' ? `knowledge/${skill}` : `workflow/${skill}`,
  },
  // projects/mexc/<skill> → coding/<skill>
  {
    container: 'projects/mexc',
    mapChild: (skill) => `coding/${skill}`,
  },
  // external/<skill> → workflow/<skill>
  {
    container: 'external',
    mapChild: (skill) => `workflow/${skill}`,
  },
];

/** Empty-shell top-level dirs to remove if empty after migration. */
const EMPTY_SHELLS = ['code', 'root-files'];

/** Old top-level dirs to remove if empty after migration. */
const OLD_TOPS = ['domains', 'workflows', 'projects', 'external'];

export class MigrateService {
  constructor(private config: Config) {}

  /** Public accessor for testing mapOldToNew. */
  mapOldToNew(oldPath: string): string | null {
    return mapOldToNew(oldPath);
  }

  async migrate(opts: { dryRun: boolean; stamp: string }): Promise<MigrateReport> {
    const { dryRun, stamp } = opts;
    const registryDir = this.config.source;
    const profilesDir = this.config.profilesDir ?? path.join(registryDir, 'profiles');

    const report: MigrateReport = {
      dryRun,
      backupDir: null,
      movedDirs: [],
      removedDirs: [],
      convertedProfiles: [],
      notes: [],
    };

    // ── 1. Compute planned moves ───────────────────────────────────────────
    for (const { container, mapChild } of MIGRATION_CONTAINERS) {
      const containerAbs = path.join(registryDir, container);

      let children: string[];
      try {
        const entries = await fs.readdir(containerAbs, { withFileTypes: true });
        children = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => e.name);
      } catch {
        // container doesn't exist in this registry — skip
        continue;
      }

      for (const child of children) {
        const newRel = mapChild(child);
        if (!newRel) continue;
        report.movedDirs.push({
          from: path.join(registryDir, container, child),
          to: path.join(registryDir, newRel),
        });
      }
    }

    // ── 2. Compute dirs to remove (empty shells + old containers) ──────────
    for (const shell of EMPTY_SHELLS) {
      const abs = path.join(registryDir, shell);
      if (await this.isEmptyOrJunkDir(abs)) {
        report.removedDirs.push(abs);
      }
    }
    // old top-level containers become empty after moves
    for (const top of OLD_TOPS) {
      const abs = path.join(registryDir, top);
      try {
        await fs.access(abs);
        report.removedDirs.push(abs);
      } catch {
        // doesn't exist — skip
      }
    }

    // ── 3. Compute profile conversions ────────────────────────────────────
    const profileUpdates: { filePath: string; content: string }[] = [];
    const noteLines: string[] = [];
    try {
      const entries = await fs.readdir(profilesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const filePath = path.join(profilesDir, entry.name);
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        // Already migrated: has categories or extras but no flat skills array
        if (
          !Array.isArray(parsed.skills) &&
          (parsed.categories !== undefined || parsed.extras !== undefined)
        ) {
          continue;
        }

        if (!Array.isArray(parsed.skills)) continue;

        const oldSkills = parsed.skills as string[];
        const extras: string[] = [];
        const byCategory: Record<string, string[]> = {};

        for (const skillPath of oldSkills) {
          // drop global/* entries
          if (skillPath.startsWith('global/')) continue;

          const newPath = mapOldToNew(skillPath);
          const resolved = newPath ?? skillPath;
          extras.push(resolved);

          // group for hint note
          const cat = resolved.split('/')[0] ?? 'unknown';
          (byCategory[cat] ??= []).push(path.basename(resolved));
        }

        const promoted = applyProfileCategoryPreset(parsed.name as string, extras);
        const newProfile: Record<string, unknown> = {
          name: parsed.name,
        };
        if (promoted.categories) newProfile.categories = promoted.categories;
        if (promoted.extras.length > 0) newProfile.extras = promoted.extras;
        // preserve any other fields (description, extends, etc.) except skills
        for (const [k, v] of Object.entries(parsed)) {
          if (
            k !== 'name' &&
            k !== 'skills' &&
            k !== 'extras' &&
            k !== 'categories'
          ) {
            newProfile[k] = v;
          }
        }

        const content = `${JSON.stringify(newProfile, null, 2)}\n`;
        profileUpdates.push({ filePath, content });
        report.convertedProfiles.push(filePath);

        // build hint note
        const hint = Object.entries(byCategory)
          .map(([cat, names]) => `  ${cat}: ${names.join(', ')}`)
          .join('\n');
        noteLines.push(
          `Profile "${parsed.name as string}" skills by new category:\n${hint}\n` +
            `  → Consider promoting some to "categories" array for auto-resolution.`
        );
      }
    } catch {
      // profilesDir doesn't exist — skip
    }

    report.notes.push(...noteLines);

    // ── 4. Execute (non-dry-run) ──────────────────────────────────────────
    if (!dryRun) {
      // 4a. Backup
      const parentDir = path.dirname(registryDir);
      const backupDir = path.join(
        parentDir,
        `skill-category-backup-${stamp}`
      );
      await fs.cp(registryDir, backupDir, { recursive: true });
      report.backupDir = backupDir;

      // 4b. Move skill dirs
      for (const { from, to } of report.movedDirs) {
        try {
          await fs.access(from);
        } catch {
          continue; // source missing — skip
        }
        await fs.mkdir(path.dirname(to), { recursive: true });
        try {
          await fs.rename(from, to);
        } catch (err: unknown) {
          // cross-device rename fallback
          const nodeErr = err as { code?: string };
          if (nodeErr.code === 'EXDEV') {
            await this.cpRm(from, to);
          } else {
            throw err;
          }
        }
      }

      // 4c. Remove empty shells
      for (const abs of report.removedDirs) {
        try {
          await fs.rm(abs, { recursive: true, force: true });
        } catch {
          // ignore removal errors
        }
      }

      // 4d. Write converted profiles
      for (const update of profileUpdates) {
        await fs.writeFile(update.filePath, update.content, 'utf8');
      }
    }

    return report;
  }

  /** Recursively copy src → dest, then remove src. Used as cross-device rename fallback. */
  private async cpRm(src: string, dest: string): Promise<void> {
    await fs.cp(src, dest, { recursive: true });
    await fs.rm(src, { recursive: true, force: true });
  }

  /** Returns true if the directory is missing, empty, or contains only junk (.DS_Store etc.). */
  private async isEmptyOrJunkDir(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries.every((e) => e.startsWith('.'));
    } catch {
      return false; // doesn't exist
    }
  }
}
