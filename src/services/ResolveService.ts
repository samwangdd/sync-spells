import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { ProfileService } from './ProfileService';
import { SkillService } from './SkillService';

export interface ResolvedProfile {
  name: string;
  skills: string[];
  sources: { extends: string[]; categories: string[]; extras: string[]; legacy: string[] };
}

export class ResolveService {
  constructor(
    private config: Config,
    private profileSvc: ProfileService,
    private _skillSvc: SkillService
  ) {}

  async resolve(name: string, seen: string[] = []): Promise<ResolvedProfile> {
    if (seen.includes(name)) throw new Error(`Circular profile extends: ${[...seen, name].join(' -> ')}`);
    if (seen.length >= 5) throw new Error(`extends chain too deep (>5): ${[...seen, name].join(' -> ')}`);
    const profile = await this.profileSvc.getProfile(name);
    if (!profile) throw new Error(`Profile not found: ${name}`);

    const sources = { extends: [] as string[], categories: [] as string[], extras: [] as string[], legacy: [] as string[] };

    if (profile.extends) {
      const parent = await this.resolve(profile.extends, [...seen, name]);
      sources.extends = parent.skills;
    }
    for (const cat of profile.categories || []) {
      if (cat === 'global' || cat === 'inbox') continue;
      const catDir = path.join(this.config.source, cat);
      try { await fs.access(catDir); } catch { continue; }
      const entries = await fs.readdir(catDir, { withFileTypes: true });
      for (const e of entries) if (e.isDirectory()) sources.categories.push(`${cat}/${e.name}`);
    }
    sources.extras = (profile.extras || []).slice();
    sources.legacy = (profile.skills || [])
      .filter((s: string) => !s.startsWith('global/') && !s.startsWith('inbox/'));

    const ordered = [...sources.extends, ...sources.categories, ...sources.extras, ...sources.legacy]
      .filter((s: string) => !s.startsWith('global/') && !s.startsWith('inbox/'));
    const byName = new Map<string, string>();
    for (const s of ordered) byName.set(path.basename(s), s);
    return { name, skills: [...byName.values()], sources };
  }
}
