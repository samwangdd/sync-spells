# Skill Profile 可视化 Web (`spells web`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local web UI (`spells web`) that browses every skill, shows each profile's resolved skill set by scenario, and lets the user edit a profile recipe (`categories`/`extras`/`excludes`) and write it back to JSON.

**Architecture:** A Zod contract in `src/shared/` is the single source of truth for all API types; a pure `resolveRecipe` function (mirroring `scripts/materialize-profile.sh` semantics) is shared by both the Node backend and the React frontend so live preview never drifts from server output. The backend is a dependency-free Node `http` server that reuses the existing service layer; the frontend is a standalone Vite + React + Tailwind app in `webui/`.

**Tech Stack:** TypeScript, Zod, Node `http`, Jest (backend TDD); Vite + React + Tailwind v4 (frontend, no component test framework per spec).

---

## Canonical resolve semantics (authoritative — from `scripts/materialize-profile.sh`)

The resolved ref list for a profile is built **in this exact order**, then deduped:

1. Every entry of `skills[]` (raw, trimmed, non-empty) — in order.
2. For every `categories[]` entry: if the category directory exists, append `category/<skill>` for each direct child containing `SKILL.md`, **sorted by skill directory name**. If the category directory does **not** exist, append the raw category string as a single ref.
3. Every entry of `extras[]` (raw, trimmed, non-empty) — in order.

Then: build the `excludes` set (trimmed, non-empty). Walk the assembled list in order; skip a ref if it is in `excludes` or already seen. **Dedup is by full ref string, order-preserving.**

Note: materialize does **not** filter `global/`/`inbox/` prefixes and does **not** process `extends` — the web contract matches materialize exactly (the existing CLI `ResolveService` differs; we are intentionally not reusing it for resolution, to keep frontend/backend identical).

For the pure `resolveRecipe(recipe, catalogByCategory)` function, `catalogByCategory` is a map whose **keys are every existing category** (even ones with an empty skill list) and whose values are the **sorted** `category/<skill>` refs. Presence of a key ⇒ category exists ⇒ expand (possibly to nothing); absence of a key ⇒ append the raw category string.

## File Structure

**Shared (browser-safe, zero Node deps):**
- `src/shared/contract.ts` — Zod schemas + `z.infer` types: `ProfileRecipe`, `SkillCard`, `ProfileView`, `CategoryView`, `AppState`, `ApiError`.
- `src/shared/resolveRecipe.ts` — pure `resolveRecipe(recipe, catalogByCategory) → string[]`.

**Backend (`src/web/`):**
- `src/web/frontmatter.ts` — hand-written SKILL.md frontmatter parser (`name`/`description`/`version`/`requires.bins`), graceful on malformed input.
- `src/web/SkillCatalogService.ts` — `getState()` assembles `AppState`; exports `buildProfileView` + `buildCatalogByCategory` helpers reused by the writer.
- `src/web/ProfileWriter.ts` — Zod shape check + business validation (known category/ref) + backup + non-destructive JSON write; throws `ProfileValidationError` for 4xx.
- `src/web/server.ts` — `createApiHandler` (pure routing), `createServer` (static + `/api`), `startServer` (port auto-increment).

**Command:**
- `src/commands/web.ts` — `runWeb` (pure: assemble deps, expose `getState`/`createServer`) + `registerWeb` (CLI I/O, `--port`, `--no-open`).

**Frontend (`webui/`):**
- `webui/index.html`, `webui/vite.config.ts`, `webui/tsconfig.json`
- `webui/src/main.tsx`, `webui/src/App.tsx`, `webui/src/index.css`
- `webui/src/api.ts` — typed client; parses responses with contract schemas.
- `webui/src/views/ScenesView.tsx`, `webui/src/views/CatalogView.tsx`
- `webui/src/components/ProfileCard.tsx`, `SkillCard.tsx`, `RecipeEditor.tsx`, `ResolvePreview.tsx`, `SkillDrawer.tsx`

---

## Task 1: Add `zod` runtime dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install zod**

Run: `npm install zod@^3.23.8`

Expected: `package.json` `dependencies` now contains `"zod"`; `package-lock.json` updated.

- [ ] **Step 2: Verify zod imports under ts-node**

Run: `npx ts-node -e "import { z } from 'zod'; console.log(typeof z.object)"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add zod runtime dependency for web contract"
```

---

## Task 2: Shared Zod contract

**Files:**
- Create: `src/shared/contract.ts`
- Test: `__tests__/shared/contract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import {
  ProfileRecipeSchema,
  SkillCardSchema,
  ProfileViewSchema,
  AppStateSchema,
} from '../../src/shared/contract';

describe('contract schemas', () => {
  it('ProfileRecipeSchema accepts a minimal recipe (name only)', () => {
    const r = ProfileRecipeSchema.parse({ name: 'mexc-code' });
    expect(r.name).toBe('mexc-code');
    expect(r.categories).toBeUndefined();
  });

  it('ProfileRecipeSchema rejects an empty name', () => {
    expect(ProfileRecipeSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('ProfileRecipeSchema rejects non-string array members', () => {
    expect(ProfileRecipeSchema.safeParse({ name: 'x', categories: [1] }).success).toBe(false);
  });

  it('SkillCardSchema requires inProfiles and ref', () => {
    const c = SkillCardSchema.parse({
      ref: 'coding/git-commit', name: 'git-commit', category: 'coding', inProfiles: ['all'],
    });
    expect(c.inProfiles).toEqual(['all']);
  });

  it('ProfileViewSchema parses a full view', () => {
    const v = ProfileViewSchema.parse({
      name: 'all', categories: ['coding'], extras: [], excludes: ['workflow/jira-handoff'],
      skills: [], resolvedRefs: ['coding/git-commit'], skillCount: 1, boundPaths: [],
    });
    expect(v.skillCount).toBe(1);
  });

  it('AppStateSchema parses an empty-ish state', () => {
    const s = AppStateSchema.parse({ profiles: [], skills: [], categories: [] });
    expect(s.profiles).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/shared/contract.test.ts`
Expected: FAIL — cannot find module `src/shared/contract`.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/contract.ts
import { z } from 'zod';

export const ProfileRecipeSchema = z.object({
  name: z.string().min(1),
  categories: z.array(z.string()).optional(),
  extras: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
});
export type ProfileRecipe = z.infer<typeof ProfileRecipeSchema>;

export const SkillCardSchema = z.object({
  ref: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  requiresBins: z.array(z.string()).optional(),
  inProfiles: z.array(z.string()),
});
export type SkillCard = z.infer<typeof SkillCardSchema>;

export const ProfileViewSchema = z.object({
  name: z.string(),
  categories: z.array(z.string()),
  extras: z.array(z.string()),
  excludes: z.array(z.string()),
  skills: z.array(z.string()),
  resolvedRefs: z.array(z.string()),
  skillCount: z.number(),
  boundPaths: z.array(z.string()),
});
export type ProfileView = z.infer<typeof ProfileViewSchema>;

export const CategoryViewSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  skillRefs: z.array(z.string()),
});
export type CategoryView = z.infer<typeof CategoryViewSchema>;

export const AppStateSchema = z.object({
  profiles: z.array(ProfileViewSchema),
  skills: z.array(SkillCardSchema),
  categories: z.array(CategoryViewSchema),
});
export type AppState = z.infer<typeof AppStateSchema>;

export const ApiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const SkillMarkdownSchema = z.object({ markdown: z.string() });
export type SkillMarkdown = z.infer<typeof SkillMarkdownSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/shared/contract.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/contract.ts __tests__/shared/contract.test.ts
git commit -m "feat(web): add shared Zod contract for skill profile API"
```

---

## Task 3: Shared `resolveRecipe` pure function

**Files:**
- Create: `src/shared/resolveRecipe.ts`
- Test: `__tests__/shared/resolveRecipe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { resolveRecipe } from '../../src/shared/resolveRecipe';

const catalog = {
  coding: ['coding/git-commit', 'coding/scss', 'coding/web-perf'],
  workflow: ['workflow/jira-handoff', 'workflow/task-run'],
  empty: [],
};

describe('resolveRecipe', () => {
  it('expands a category to its sorted refs', () => {
    expect(resolveRecipe({ categories: ['coding'] }, catalog))
      .toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf']);
  });

  it('appends extras after categories', () => {
    expect(resolveRecipe({ categories: ['coding'], extras: ['workflow/task-run'] }, catalog))
      .toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf', 'workflow/task-run']);
  });

  it('removes excluded refs', () => {
    expect(resolveRecipe({ categories: ['coding', 'workflow'], excludes: ['workflow/jira-handoff'] }, catalog))
      .toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf', 'workflow/task-run']);
  });

  it('puts raw skills[] first, in order', () => {
    expect(resolveRecipe({ skills: ['coding/web-perf'], categories: ['coding'] }, catalog))
      .toEqual(['coding/web-perf', 'coding/git-commit', 'coding/scss']);
  });

  it('dedups by full ref, preserving first position', () => {
    expect(resolveRecipe({ extras: ['coding/scss'], categories: ['coding'] }, catalog))
      .toEqual(['coding/scss', 'coding/git-commit', 'coding/web-perf']);
  });

  it('expands an existing-but-empty category to nothing (key present)', () => {
    expect(resolveRecipe({ categories: ['empty'], extras: ['workflow/task-run'] }, catalog))
      .toEqual(['workflow/task-run']);
  });

  it('appends the raw category string when the category is unknown', () => {
    expect(resolveRecipe({ categories: ['nope'] }, catalog)).toEqual(['nope']);
  });

  it('trims and drops empty entries in skills/extras/excludes', () => {
    expect(resolveRecipe({ extras: ['  coding/scss  ', '', '   '] }, catalog))
      .toEqual(['coding/scss']);
  });

  it('returns [] for an empty recipe', () => {
    expect(resolveRecipe({}, catalog)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/shared/resolveRecipe.test.ts`
Expected: FAIL — cannot find module `src/shared/resolveRecipe`.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/resolveRecipe.ts
import type { ProfileRecipe } from './contract';

type RecipeInput = Pick<ProfileRecipe, 'categories' | 'extras' | 'excludes' | 'skills'>;

/**
 * Mirrors scripts/materialize-profile.sh resolution: skills[] (raw) -> each
 * category expanded to its sorted refs (or raw category string if the category
 * key is absent) -> extras[]; then excludes removed and order-preserving dedup
 * by full ref. catalogByCategory keys MUST include every existing category
 * (even empty ones); values MUST already be sorted.
 */
export function resolveRecipe(
  recipe: RecipeInput,
  catalogByCategory: Record<string, string[]>,
): string[] {
  const refs: string[] = [];
  const pushTrimmed = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed) refs.push(trimmed);
  };

  for (const ref of recipe.skills ?? []) pushTrimmed(ref);

  for (const category of recipe.categories ?? []) {
    const name = category.trim();
    if (!name) continue;
    if (Object.prototype.hasOwnProperty.call(catalogByCategory, name)) {
      for (const ref of catalogByCategory[name]) refs.push(ref);
    } else {
      refs.push(name);
    }
  }

  for (const ref of recipe.extras ?? []) pushTrimmed(ref);

  const excludes = new Set(
    (recipe.excludes ?? []).map((ref) => ref.trim()).filter(Boolean),
  );
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const ref of refs) {
    if (excludes.has(ref) || seen.has(ref)) continue;
    seen.add(ref);
    resolved.push(ref);
  }
  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/shared/resolveRecipe.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/resolveRecipe.ts __tests__/shared/resolveRecipe.test.ts
git commit -m "feat(web): add shared resolveRecipe mirroring materialize semantics"
```

---

## Task 4: SKILL.md frontmatter parser

**Files:**
- Create: `src/web/frontmatter.ts`
- Test: `__tests__/web/frontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { parseFrontmatter } from '../../src/web/frontmatter';

describe('parseFrontmatter', () => {
  it('parses name and description', () => {
    const md = `---\nname: git-commit\ndescription: Use when committing code.\n---\n# Body`;
    expect(parseFrontmatter(md)).toEqual({ name: 'git-commit', description: 'Use when committing code.' });
  });

  it('strips surrounding quotes from values', () => {
    const md = `---\nname: lark-mail\ndescription: "Use when drafting Lark emails."\n---`;
    const r = parseFrontmatter(md);
    expect(r.description).toBe('Use when drafting Lark emails.');
  });

  it('parses version', () => {
    const md = `---\nname: lark-mail\nversion: 1.0.0\ndescription: x\n---`;
    expect(parseFrontmatter(md).version).toBe('1.0.0');
  });

  it('parses nested metadata.requires.bins inline array', () => {
    const md = `---\nname: lark-mail\nmetadata:\n  requires:\n    bins: ["lark-cli"]\n  cliHelp: "x"\n---`;
    expect(parseFrontmatter(md).requiresBins).toEqual(['lark-cli']);
  });

  it('parses bins with single quotes', () => {
    const md = `---\nname: x\nmetadata:\n  requires:\n    bins: ['a', 'b']\n---`;
    expect(parseFrontmatter(md).requiresBins).toEqual(['a', 'b']);
  });

  it('returns {} when there is no frontmatter block', () => {
    expect(parseFrontmatter('# Just a heading\n')).toEqual({});
  });

  it('degrades gracefully on malformed bins (no throw, no field)', () => {
    const md = `---\nname: x\nmetadata:\n  requires:\n    bins: [oops\n---`;
    const r = parseFrontmatter(md);
    expect(r.name).toBe('x');
    expect(r.requiresBins).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/web/frontmatter.test.ts`
Expected: FAIL — cannot find module `src/web/frontmatter`.

- [ ] **Step 3: Write the implementation**

```ts
// src/web/frontmatter.ts
export interface ParsedFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  requiresBins?: string[];
}

const stripQuotes = (value: string): string => {
  const t = value.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
};

export const parseFrontmatter = (content: string): ParsedFrontmatter => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  const out: ParsedFrontmatter = {};

  const scalar = (key: string): string | undefined => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? stripQuotes(m[1]) : undefined;
  };

  const name = scalar('name');
  const description = scalar('description');
  const version = scalar('version');
  if (name !== undefined) out.name = name;
  if (description !== undefined) out.description = description;
  if (version !== undefined) out.version = version;

  const bins = block.match(/^\s*bins:\s*(\[.*\])\s*$/m);
  if (bins) {
    try {
      const parsed: unknown = JSON.parse(bins[1].replace(/'/g, '"'));
      if (Array.isArray(parsed)) out.requiresBins = parsed.map((b) => String(b));
    } catch {
      // graceful degradation: leave requiresBins unset
    }
  }
  return out;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/web/frontmatter.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/frontmatter.ts __tests__/web/frontmatter.test.ts
git commit -m "feat(web): add SKILL.md frontmatter parser"
```

---

## Task 5: SkillCatalogService

**Files:**
- Create: `src/web/SkillCatalogService.ts`
- Test: `__tests__/web/SkillCatalogService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { SkillCatalogService } from '../../src/web/SkillCatalogService';

describe('SkillCatalogService', () => {
  let dir: string; let cfg: Config;

  const writeSkill = async (ref: string, frontmatter: string) => {
    await fs.mkdir(path.join(dir, ref), { recursive: true });
    await fs.writeFile(path.join(dir, ref, 'SKILL.md'), `---\n${frontmatter}\n---\n# ${ref}\n`);
  };

  beforeEach(async () => {
    dir = path.join('/tmp', `catalog-${Date.now()}`);
    await writeSkill('coding/git-commit', 'name: git-commit\ndescription: Commit helper.');
    await writeSkill('coding/scss', 'name: scss\nversion: 2.0.0');
    await writeSkill('workflow/jira-handoff', 'name: jira-handoff\ndescription: Handoff.\nmetadata:\n  requires:\n    bins: ["jira"]');
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir, 'profiles', 'all.json'),
      JSON.stringify({ name: 'all', categories: ['coding', 'workflow'], excludes: ['workflow/jira-handoff'] }));
    await fs.writeFile(path.join(dir, 'profiles', 'code.json'),
      JSON.stringify({ name: 'code', categories: ['coding'] }));
    cfg = {
      source: dir, tools: {}, profilesDir: path.join(dir, 'profiles'),
      projectBindings: [{ path: '/tmp/proj-x', profile: 'code' }],
    };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('builds skill cards with frontmatter fields', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const scss = state.skills.find((s) => s.ref === 'coding/scss');
    expect(scss?.version).toBe('2.0.0');
    const jira = state.skills.find((s) => s.ref === 'workflow/jira-handoff');
    expect(jira?.requiresBins).toEqual(['jira']);
  });

  it('computes inProfiles by resolved membership (excludes respected)', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const gitCommit = state.skills.find((s) => s.ref === 'coding/git-commit');
    expect(gitCommit?.inProfiles.sort()).toEqual(['all', 'code']);
    const jira = state.skills.find((s) => s.ref === 'workflow/jira-handoff');
    expect(jira?.inProfiles).toEqual([]); // excluded from 'all', not in 'code'
  });

  it('builds profile views with resolvedRefs, skillCount and boundPaths', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const all = state.profiles.find((p) => p.name === 'all')!;
    expect(all.resolvedRefs.sort()).toEqual(['coding/git-commit', 'coding/scss']);
    expect(all.skillCount).toBe(2);
    const code = state.profiles.find((p) => p.name === 'code')!;
    expect(code.boundPaths).toEqual(['/tmp/proj-x']);
  });

  it('lists categories with sorted skillRefs', async () => {
    const state = await new SkillCatalogService(cfg).getState();
    const coding = state.categories.find((c) => c.name === 'coding')!;
    expect(coding.skillRefs).toEqual(['coding/git-commit', 'coding/scss']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/web/SkillCatalogService.test.ts`
Expected: FAIL — cannot find module `src/web/SkillCatalogService`.

- [ ] **Step 3: Write the implementation**

```ts
// src/web/SkillCatalogService.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { Profile } from '../types';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
import { resolveRecipe } from '../shared/resolveRecipe';
import { parseFrontmatter } from './frontmatter';
import { AppState, ProfileView, SkillCard, CategoryView } from '../shared/contract';

export const buildProfileView = (
  profile: Profile,
  catalogByCategory: Record<string, string[]>,
  projectBindings: { path: string; profile: string }[],
): ProfileView => {
  const recipe = {
    skills: profile.skills ?? [],
    categories: profile.categories ?? [],
    extras: profile.extras ?? [],
    excludes: (profile as { excludes?: string[] }).excludes ?? [],
  };
  const resolvedRefs = resolveRecipe(recipe, catalogByCategory);
  return {
    name: profile.name,
    categories: recipe.categories,
    extras: recipe.extras,
    excludes: recipe.excludes,
    skills: recipe.skills,
    resolvedRefs,
    skillCount: resolvedRefs.length,
    boundPaths: projectBindings.filter((b) => b.profile === profile.name).map((b) => b.path),
  };
};

export class SkillCatalogService {
  private profileSvc: ProfileService;
  private skillSvc: SkillService;

  constructor(private config: Config) {
    this.profileSvc = new ProfileService(config);
    this.skillSvc = new SkillService(config);
  }

  async buildCatalogByCategory(): Promise<Record<string, string[]>> {
    const skills = await this.skillSvc.listSkills();
    const catalog: Record<string, string[]> = {};
    for (const skill of skills) {
      (catalog[skill.category] ??= []).push(skill.path);
    }
    for (const category of Object.keys(catalog)) {
      catalog[category].sort();
    }
    return catalog;
  }

  async getState(): Promise<AppState> {
    const [profiles, skillInfos, catalog] = await Promise.all([
      this.profileSvc.listProfiles(),
      this.skillSvc.listSkills(),
      this.buildCatalogByCategory(),
    ]);
    const bindings = this.config.projectBindings ?? [];

    const profileViews = profiles.map((p) => buildProfileView(p, catalog, bindings));
    const resolvedByProfile = new Map(profileViews.map((v) => [v.name, new Set(v.resolvedRefs)]));

    const skills: SkillCard[] = await Promise.all(
      skillInfos.map(async (info): Promise<SkillCard> => {
        const fm = await this.readFrontmatter(info.path);
        const inProfiles = profileViews
          .filter((v) => resolvedByProfile.get(v.name)!.has(info.path))
          .map((v) => v.name);
        return {
          ref: info.path,
          name: info.name,
          category: info.category,
          description: fm.description,
          version: fm.version,
          requiresBins: fm.requiresBins,
          inProfiles,
        };
      }),
    );

    const categories: CategoryView[] = Object.keys(catalog)
      .sort()
      .map((name) => ({ name, skillRefs: catalog[name] }));

    return { profiles: profileViews, skills, categories };
  }

  private async readFrontmatter(ref: string) {
    try {
      const content = await fs.readFile(path.join(this.config.source, ref, 'SKILL.md'), 'utf8');
      return parseFrontmatter(content);
    } catch {
      return {}; // graceful: card shows name only
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/web/SkillCatalogService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/SkillCatalogService.ts __tests__/web/SkillCatalogService.test.ts
git commit -m "feat(web): add SkillCatalogService assembling AppState"
```

---

## Task 6: ProfileWriter

**Files:**
- Create: `src/web/ProfileWriter.ts`
- Test: `__tests__/web/ProfileWriter.test.ts`

- [ ] **Step 1: Write the failing test**

Note: this test mocks `os.homedir()` so `backup.ts` writes under a temp home, following the repo convention.

```ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const load = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({ ...actualOs, homedir: () => homeDir }));
  return require('../../src/web/ProfileWriter') as typeof import('../../src/web/ProfileWriter');
};

describe('ProfileWriter', () => {
  let dir: string; let home: string; let cfg: any;

  beforeEach(async () => {
    dir = path.join('/tmp', `pw-${Date.now()}`);
    home = path.join('/tmp', `pw-home-${Date.now()}`);
    for (const ref of ['coding/git-commit', 'coding/scss', 'workflow/task-run']) {
      await fs.mkdir(path.join(dir, ref), { recursive: true });
      await fs.writeFile(path.join(dir, ref, 'SKILL.md'), `---\nname: ${path.basename(ref)}\n---\n`);
    }
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir, 'profiles', 'code.json'),
      `${JSON.stringify({ name: 'code', categories: ['coding'], extras: ['workflow/task-run'] }, null, 2)}\n`);
    cfg = { source: dir, tools: {}, profilesDir: path.join(dir, 'profiles'), projectBindings: [] };
  });
  afterEach(async () => {
    jest.dontMock('os');
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  it('rejects a non-object / bad shape with ProfileValidationError (no write)', async () => {
    const { ProfileWriter, ProfileValidationError } = load(home);
    const before = await fs.readFile(path.join(dir, 'profiles', 'code.json'), 'utf8');
    await expect(new ProfileWriter(cfg).write('code', { name: 'code', categories: [1] }))
      .rejects.toBeInstanceOf(ProfileValidationError);
    expect(await fs.readFile(path.join(dir, 'profiles', 'code.json'), 'utf8')).toBe(before);
  });

  it('rejects an unknown category (no write)', async () => {
    const { ProfileWriter, ProfileValidationError } = load(home);
    await expect(new ProfileWriter(cfg).write('code', { name: 'code', categories: ['nope'] }))
      .rejects.toBeInstanceOf(ProfileValidationError);
  });

  it('rejects an unknown extra ref (no write)', async () => {
    const { ProfileWriter, ProfileValidationError } = load(home);
    await expect(new ProfileWriter(cfg).write('code', { name: 'code', extras: ['workflow/ghost'] }))
      .rejects.toBeInstanceOf(ProfileValidationError);
  });

  it('writes valid recipe, backs up old file, returns updated view', async () => {
    const { ProfileWriter } = load(home);
    const view = await new ProfileWriter(cfg).write('code', {
      name: 'code', categories: ['coding'], extras: [], excludes: ['coding/scss'],
    });
    expect(view.resolvedRefs).toEqual(['coding/git-commit']);
    expect(view.skillCount).toBe(1);
    const backups = await fs.readdir(path.join(home, '.sync-spells', 'backups'));
    expect(backups.length).toBeGreaterThan(0);
  });

  it('writes 2-space JSON with trailing newline and omits empty arrays', async () => {
    const { ProfileWriter } = load(home);
    await new ProfileWriter(cfg).write('code', { name: 'code', categories: ['coding'], extras: [], excludes: [] });
    const written = await fs.readFile(path.join(dir, 'profiles', 'code.json'), 'utf8');
    expect(written).toBe(`${JSON.stringify({ name: 'code', categories: ['coding'] }, null, 2)}\n`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/web/ProfileWriter.test.ts`
Expected: FAIL — cannot find module `src/web/ProfileWriter`.

- [ ] **Step 3: Write the implementation**

```ts
// src/web/ProfileWriter.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { backupPath } from '../lib/backup';
import { ProfileRecipeSchema, ProfileView } from '../shared/contract';
import { SkillCatalogService, buildProfileView } from './SkillCatalogService';

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

export class ProfileWriter {
  private catalog: SkillCatalogService;

  constructor(private config: Config) {
    this.catalog = new SkillCatalogService(config);
  }

  async write(name: string, body: unknown): Promise<ProfileView> {
    const parsed = ProfileRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProfileValidationError(`Invalid profile shape: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    const recipe = parsed.data;

    const catalogByCategory = await this.catalog.buildCatalogByCategory();
    const knownCategories = new Set(Object.keys(catalogByCategory));
    const knownRefs = new Set(Object.values(catalogByCategory).flat());

    for (const category of recipe.categories ?? []) {
      if (!knownCategories.has(category)) throw new ProfileValidationError(`Unknown category: ${category}`);
    }
    for (const ref of [...(recipe.skills ?? []), ...(recipe.extras ?? []), ...(recipe.excludes ?? [])]) {
      if (!knownRefs.has(ref)) throw new ProfileValidationError(`Unknown skill ref: ${ref}`);
    }

    const profilesDir = this.config.profilesDir || path.join(this.config.source, 'profiles');
    const filePath = path.join(profilesDir, `${name}.json`);

    const existing = await this.readExisting(filePath);
    if (existing) await backupPath(filePath);

    const output: Record<string, unknown> = { ...existing, name: recipe.name };
    const setOrDelete = (key: 'categories' | 'extras' | 'excludes' | 'skills') => {
      const value = recipe[key];
      if (value && value.length > 0) output[key] = value;
      else delete output[key];
    };
    setOrDelete('categories');
    setOrDelete('extras');
    setOrDelete('excludes');
    setOrDelete('skills');

    await fs.mkdir(profilesDir, { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    return buildProfileView(
      { name: recipe.name, categories: recipe.categories, extras: recipe.extras, skills: recipe.skills,
        ...({ excludes: recipe.excludes } as object) },
      catalogByCategory,
      this.config.projectBindings ?? [],
    );
  }

  private async readExisting(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/web/ProfileWriter.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/ProfileWriter.ts __tests__/web/ProfileWriter.test.ts
git commit -m "feat(web): add ProfileWriter with validation, backup and safe write"
```

---

## Task 7: HTTP API handler + server

**Files:**
- Create: `src/web/server.ts`
- Test: `__tests__/web/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from '@jest/globals';
import { createApiHandler } from '../../src/web/server';
import { AppState, ProfileView } from '../../src/shared/contract';

const sampleState: AppState = { profiles: [], skills: [], categories: [] };
const sampleView: ProfileView = {
  name: 'code', categories: ['coding'], extras: [], excludes: [], skills: [],
  resolvedRefs: ['coding/git-commit'], skillCount: 1, boundPaths: [],
};

class FakeValidationError extends Error {}

const deps = {
  getState: async () => sampleState,
  writeProfile: async (name: string, body: any) => {
    if (body && body.bad) { const e = new FakeValidationError('bad shape'); e.name = 'ProfileValidationError'; throw e; }
    if (body && body.boom) throw new Error('disk locked');
    return sampleView;
  },
  readMarkdown: async (ref: string) => `# ${ref}`,
};

describe('createApiHandler', () => {
  const handle = createApiHandler(deps as any);

  it('GET /api/state returns 200 + state', async () => {
    const res = await handle('GET', '/api/state', undefined);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleState);
  });

  it('PUT /api/profiles/:name returns 200 + view', async () => {
    const res = await handle('PUT', '/api/profiles/code', { name: 'code' });
    expect(res.status).toBe(200);
    expect((res.body as ProfileView).name).toBe('code');
  });

  it('PUT with validation error returns 400', async () => {
    const res = await handle('PUT', '/api/profiles/code', { bad: true });
    expect(res.status).toBe(400);
    expect((res.body as any).error).toContain('bad shape');
  });

  it('PUT with write failure returns 500', async () => {
    const res = await handle('PUT', '/api/profiles/code', { boom: true });
    expect(res.status).toBe(500);
  });

  it('GET /api/skill/:ref/markdown returns 200 + markdown', async () => {
    const res = await handle('GET', '/api/skill/coding%2Fgit-commit/markdown', undefined);
    expect(res.status).toBe(200);
    expect((res.body as any).markdown).toBe('# coding/git-commit');
  });

  it('unknown route returns 404', async () => {
    const res = await handle('GET', '/api/nope', undefined);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/web/server.test.ts`
Expected: FAIL — cannot find module `src/web/server`.

- [ ] **Step 3: Write the implementation**

```ts
// src/web/server.ts
import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppState, ProfileView } from '../shared/contract';

export interface ApiDeps {
  getState: () => Promise<AppState>;
  writeProfile: (name: string, body: unknown) => Promise<ProfileView>;
  readMarkdown: (ref: string) => Promise<string>;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

const isValidationError = (e: unknown): boolean =>
  e instanceof Error && e.name === 'ProfileValidationError';

export const createApiHandler =
  (deps: ApiDeps) =>
  async (method: string, urlPath: string, body: unknown): Promise<ApiResult> => {
    if (method === 'GET' && urlPath === '/api/state') {
      return { status: 200, body: await deps.getState() };
    }

    const putMatch = urlPath.match(/^\/api\/profiles\/([^/]+)$/);
    if (method === 'PUT' && putMatch) {
      const name = decodeURIComponent(putMatch[1]);
      try {
        return { status: 200, body: await deps.writeProfile(name, body) };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { status: isValidationError(e) ? 400 : 500, body: { error: message } };
      }
    }

    const mdMatch = urlPath.match(/^\/api\/skill\/(.+)\/markdown$/);
    if (method === 'GET' && mdMatch) {
      const ref = decodeURIComponent(mdMatch[1]);
      try {
        return { status: 200, body: { markdown: await deps.readMarkdown(ref) } };
      } catch (e) {
        return { status: 404, body: { error: e instanceof Error ? e.message : String(e) } };
      }
    }

    return { status: 404, body: { error: `Not found: ${method} ${urlPath}` } };
  };

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const readBody = (req: http.IncomingMessage): Promise<unknown> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch { resolve(undefined); }
    });
  });

export const createServer = (deps: ApiDeps, distDir: string): http.Server => {
  const apiHandler = createApiHandler(deps);
  return http.createServer(async (req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath.startsWith('/api/')) {
      const body = req.method === 'PUT' || req.method === 'POST' ? await readBody(req) : undefined;
      const result = await apiHandler(req.method || 'GET', urlPath, body);
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.body));
      return;
    }

    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.join(distDir, rel);
    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      // SPA fallback
      try {
        const html = await fs.readFile(path.join(distDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
        res.end(html);
      } catch {
        res.writeHead(404).end('Not found');
      }
    }
  });
};

export const startServer = (server: http.Server, preferredPort: number, maxAttempts = 10): Promise<number> =>
  new Promise((resolve, reject) => {
    let port = preferredPort;
    let attempts = 0;
    const tryListen = () => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          attempts++;
          port++;
          tryListen();
        } else {
          reject(err);
        }
      });
      server.listen(port, () => resolve(port));
    };
    tryListen();
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/web/server.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/server.ts __tests__/web/server.test.ts
git commit -m "feat(web): add Node http API handler and static server"
```

---

## Task 8: `spells web` command + registration

**Files:**
- Create: `src/commands/web.ts`
- Modify: `src/index.ts:16` (add import) and `src/index.ts:38` (register)
- Test: `__tests__/commands/web.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { runWeb } from '../../src/commands/web';

describe('runWeb', () => {
  let dir: string; let cfg: Config;
  beforeEach(async () => {
    dir = path.join('/tmp', `web-${Date.now()}`);
    await fs.mkdir(path.join(dir, 'coding', 'git-commit'), { recursive: true });
    await fs.writeFile(path.join(dir, 'coding', 'git-commit', 'SKILL.md'), `---\nname: git-commit\n---\n`);
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir, 'profiles', 'code.json'),
      JSON.stringify({ name: 'code', categories: ['coding'] }));
    cfg = { source: dir, tools: {}, profilesDir: path.join(dir, 'profiles'), projectBindings: [] };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('assembles dependencies and can build AppState without listening', async () => {
    const handle = runWeb(cfg);
    const state = await handle.getState();
    expect(state.profiles.map((p) => p.name)).toContain('code');
    expect(state.skills.map((s) => s.ref)).toContain('coding/git-commit');
    expect(typeof handle.createServer).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/web.test.ts`
Expected: FAIL — cannot find module `src/commands/web`.

- [ ] **Step 3: Write the implementation**

```ts
// src/commands/web.ts
import { Command } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, readConfig } from '../lib/config';
import { SkillCatalogService } from '../web/SkillCatalogService';
import { ProfileWriter } from '../web/ProfileWriter';
import { ApiDeps, createServer, startServer } from '../web/server';
import * as http from 'http';

export interface WebHandle {
  getState: ApiDeps['getState'];
  createServer: (distDir: string) => http.Server;
}

export const runWeb = (config: Config): WebHandle => {
  const catalog = new SkillCatalogService(config);
  const writer = new ProfileWriter(config);
  const deps: ApiDeps = {
    getState: () => catalog.getState(),
    writeProfile: (name, body) => writer.write(name, body),
    readMarkdown: async (ref) => {
      const safeRef = ref.replace(/\.\.+/g, '');
      return fs.readFile(path.join(config.source, safeRef, 'SKILL.md'), 'utf8');
    },
  };
  return { getState: deps.getState, createServer: (distDir: string) => createServer(deps, distDir) };
};

const openBrowser = (url: string): void => {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
};

export const registerWeb = (program: Command, getConfig: () => Promise<Config> = readConfig): void => {
  program
    .command('web')
    .description('Launch the local skill profile web UI')
    .option('--port <n>', 'preferred port', '4178')
    .option('--no-open', 'do not open the browser automatically')
    .action(async (opts: { port: string; open: boolean }) => {
      const config = await getConfig();
      const distDir = path.join(__dirname, '..', '..', 'webui', 'dist');
      try {
        await fs.access(path.join(distDir, 'index.html'));
      } catch {
        console.error('\nweb UI is not built yet. Run:\n  npm run web:build\n');
        process.exit(1);
      }
      const handle = runWeb(config);
      const server = handle.createServer(distDir);
      const port = await startServer(server, Number(opts.port) || 4178);
      const url = `http://localhost:${port}`;
      console.log(`\nspells web running at ${url}\n`);
      if (opts.open) openBrowser(url);
    });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/web.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Register the command in `src/index.ts`**

Add the import alongside the other command imports (after line 15, the `registerWorkspace` import):

```ts
import { registerWeb } from './commands/web';
```

Add the registration call after `registerWorkspace(program, readConfig);` (line 38):

```ts
registerWeb(program, readConfig);
```

- [ ] **Step 6: Verify full backend build + tests pass**

Run: `npm run build && npm test`
Expected: `tsc` compiles with no errors; all jest suites PASS.

- [ ] **Step 7: Commit**

```bash
git add src/commands/web.ts src/index.ts __tests__/commands/web.test.ts
git commit -m "feat(web): add spells web command and register it"
```

---

## Task 9: Frontend scaffold (Vite + React + Tailwind) — minimal buildable app

**Files:**
- Modify: `package.json` (devDeps + scripts)
- Create: `webui/index.html`, `webui/vite.config.ts`, `webui/tsconfig.json`
- Create: `webui/src/main.tsx`, `webui/src/App.tsx`, `webui/src/index.css`
- Modify: `.gitignore` (ignore `webui/dist`)

- [ ] **Step 1: Install frontend devDependencies**

Run:
```bash
npm install -D vite@^6 @vitejs/plugin-react@^4 react@^18 react-dom@^18 @types/react@^18 @types/react-dom@^18 tailwindcss@^4 @tailwindcss/vite@^4
```

Expected: these appear under `devDependencies` in `package.json`.

- [ ] **Step 2: Add npm scripts**

Edit `package.json` `scripts` to add (keep existing `build`/`test`/`dev`):

```json
    "web:dev": "vite --config webui/vite.config.ts",
    "web:build": "vite build --config webui/vite.config.ts"
```

- [ ] **Step 3: Ignore the built frontend**

Append to `.gitignore`:

```
# Built web UI (generated by `npm run web:build`)
webui/dist/
```

- [ ] **Step 4: Create the Vite config**

```ts
// webui/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '..', 'src', 'shared') },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4178' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
```

- [ ] **Step 5: Create the webui tsconfig**

```json
// webui/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@shared/*": ["../src/shared/*"] }
  },
  "include": ["src", "vite.config.ts", "../src/shared"]
}
```

- [ ] **Step 6: Create index.html**

```html
<!-- webui/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spells · Skill Profiles</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create the Tailwind entry + design tokens**

```css
/* webui/src/index.css */
@import "tailwindcss";

:root {
  --mx-bg: #f7f6f3;
  --mx-surface: #ffffff;
  --mx-border: #e7e4de;
  --mx-text: #2b2a28;
  --mx-muted: #8a857c;
  --mx-primary: #2f6df6;
  --mx-primary-soft: #eaf1ff;
  --mx-shadow: 0 1px 3px rgba(35, 33, 30, 0.08), 0 4px 12px rgba(35, 33, 30, 0.05);
  --mx-radius: 14px;
}

body {
  margin: 0;
  background: var(--mx-bg);
  color: var(--mx-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
```

- [ ] **Step 8: Create the minimal App + entry**

```tsx
// webui/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

```tsx
// webui/src/App.tsx
import React from 'react';

export const App: React.FC = () => {
  return (
    <div className="p-8 text-[var(--mx-text)]">
      <h1 className="text-2xl font-semibold">Spells · Skill Profiles</h1>
      <p className="text-[var(--mx-muted)]">Loading…</p>
    </div>
  );
};
```

- [ ] **Step 9: Verify the frontend builds**

Run: `npm run web:build`
Expected: Vite writes `webui/dist/index.html` and assets; exit code 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore webui/index.html webui/vite.config.ts webui/tsconfig.json webui/src/main.tsx webui/src/App.tsx webui/src/index.css
git commit -m "feat(webui): scaffold Vite + React + Tailwind app"
```

---

## Task 10: Typed API client + App shell

**Files:**
- Create: `webui/src/api.ts`
- Modify: `webui/src/App.tsx`

- [ ] **Step 1: Create the typed API client**

```ts
// webui/src/api.ts
import {
  AppStateSchema, ProfileViewSchema, SkillMarkdownSchema,
  type AppState, type ProfileRecipe, type ProfileView, type SkillMarkdown,
} from '@shared/contract';

const json = async (res: Response): Promise<unknown> => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
};

export const fetchState = async (): Promise<AppState> =>
  AppStateSchema.parse(await json(await fetch('/api/state')));

export const saveProfile = async (name: string, recipe: ProfileRecipe): Promise<ProfileView> =>
  ProfileViewSchema.parse(
    await json(
      await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      }),
    ),
  );

export const fetchMarkdown = async (ref: string): Promise<SkillMarkdown> =>
  SkillMarkdownSchema.parse(
    await json(await fetch(`/api/skill/${encodeURIComponent(ref)}/markdown`)),
  );
```

- [ ] **Step 2: Replace App with the shell (top bar + view toggle + state loading)**

```tsx
// webui/src/App.tsx
import React, { useEffect, useState } from 'react';
import type { AppState } from '@shared/contract';
import { fetchState } from './api';
import { ScenesView } from './views/ScenesView';
import { CatalogView } from './views/CatalogView';

type Tab = 'scenes' | 'catalog';

export const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('scenes');
  const [search, setSearch] = useState('');

  const reload = () => fetchState().then(setState).catch((e) => setError(String(e.message || e)));
  useEffect(() => { reload(); }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-[var(--mx-border)] bg-[var(--mx-surface)] px-6 py-3"
        style={{ boxShadow: 'var(--mx-shadow)' }}>
        <h1 className="text-lg font-semibold">Spells</h1>
        <nav className="flex gap-1 rounded-full bg-[var(--mx-bg)] p-1">
          {(['scenes', 'catalog'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1 text-sm ${tab === t ? 'bg-[var(--mx-primary)] text-white' : 'text-[var(--mx-muted)]'}`}>
              {t === 'scenes' ? '场景' : '目录'}
            </button>
          ))}
        </nav>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索 skill / 场景…"
          className="ml-auto w-64 rounded-full border border-[var(--mx-border)] bg-[var(--mx-bg)] px-4 py-1.5 text-sm outline-none focus:border-[var(--mx-primary)]" />
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {!state ? (
          <p className="text-[var(--mx-muted)]">Loading…</p>
        ) : tab === 'scenes' ? (
          <ScenesView state={state} search={search} onSaved={reload} onError={setError} />
        ) : (
          <CatalogView state={state} search={search} />
        )}
      </main>
    </div>
  );
};
```

- [ ] **Step 3: Verify the build fails only on the not-yet-created views**

Run: `npm run web:build`
Expected: FAIL — Vite cannot resolve `./views/ScenesView` / `./views/CatalogView` (these are created in Tasks 11–12). This confirms the shell is wired; proceed to create the views.

- [ ] **Step 4: Commit (after Task 12 build passes — do not commit a broken build)**

Defer the commit for this task until Tasks 11 and 12 are complete and `npm run web:build` passes, then commit all three together:

```bash
git add webui/src/api.ts webui/src/App.tsx
git commit -m "feat(webui): add typed API client and app shell"
```

---

## Task 11: Catalog view + skill card + skill drawer

**Files:**
- Create: `webui/src/components/SkillCard.tsx`
- Create: `webui/src/components/SkillDrawer.tsx`
- Create: `webui/src/views/CatalogView.tsx`

- [ ] **Step 1: Create the SkillCard component**

```tsx
// webui/src/components/SkillCard.tsx
import React from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';

export const SkillCard: React.FC<{ skill: SkillCardData; onOpen: () => void }> = ({ skill, onOpen }) => (
  <button onClick={onOpen}
    className="flex flex-col gap-2 rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-4 text-left transition hover:border-[var(--mx-primary)]"
    style={{ boxShadow: 'var(--mx-shadow)' }}>
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium">{skill.name}</span>
      {skill.version && <span className="rounded bg-[var(--mx-bg)] px-1.5 py-0.5 text-xs text-[var(--mx-muted)]">v{skill.version}</span>}
    </div>
    {skill.description && <p className="line-clamp-3 text-sm text-[var(--mx-muted)]">{skill.description}</p>}
    <div className="mt-auto flex flex-wrap gap-1.5">
      {(skill.requiresBins ?? []).map((bin) => (
        <span key={bin} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">⌘ {bin}</span>
      ))}
      <span className="rounded bg-[var(--mx-primary-soft)] px-1.5 py-0.5 text-xs text-[var(--mx-primary)]">
        出现在 {skill.inProfiles.length} 个场景
      </span>
    </div>
  </button>
);
```

- [ ] **Step 2: Create the SkillDrawer component**

```tsx
// webui/src/components/SkillDrawer.tsx
import React, { useEffect, useState } from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';
import { fetchMarkdown } from '../api';

export const SkillDrawer: React.FC<{ skill: SkillCardData; onClose: () => void }> = ({ skill, onClose }) => {
  const [markdown, setMarkdown] = useState<string>('Loading…');
  useEffect(() => {
    let active = true;
    fetchMarkdown(skill.ref).then((r) => active && setMarkdown(r.markdown)).catch((e) => active && setMarkdown(String(e.message || e)));
    return () => { active = false; };
  }, [skill.ref]);

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/20" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-[var(--mx-surface)] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{skill.name}</h2>
          <button onClick={onClose} className="text-[var(--mx-muted)]">✕</button>
        </div>
        <p className="mb-2 text-sm text-[var(--mx-muted)]">{skill.ref}</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {skill.inProfiles.map((p) => (
            <span key={p} className="rounded bg-[var(--mx-primary-soft)] px-2 py-0.5 text-xs text-[var(--mx-primary)]">{p}</span>
          ))}
        </div>
        <pre className="whitespace-pre-wrap rounded-lg bg-[var(--mx-bg)] p-4 text-xs leading-relaxed">{markdown}</pre>
      </aside>
    </div>
  );
};
```

- [ ] **Step 3: Create the CatalogView**

```tsx
// webui/src/views/CatalogView.tsx
import React, { useMemo, useState } from 'react';
import type { AppState, SkillCard as SkillCardData } from '@shared/contract';
import { SkillCard } from '../components/SkillCard';
import { SkillDrawer } from '../components/SkillDrawer';

export const CatalogView: React.FC<{ state: AppState; search: string }> = ({ state, search }) => {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.skills.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
    });
  }, [state.skills, search, category]);

  const byCategory = useMemo(() => {
    const map = new Map<string, SkillCardData[]>();
    for (const s of filtered) (map.get(s.category) ?? map.set(s.category, []).get(s.category)!).push(s);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const openSkill = state.skills.find((s) => s.ref === openRef) ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {['all', ...state.categories.map((c) => c.name)].map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1 text-sm ${category === c ? 'bg-[var(--mx-primary)] text-white' : 'bg-[var(--mx-surface)] text-[var(--mx-muted)] border border-[var(--mx-border)]'}`}>
            {c}
          </button>
        ))}
      </div>
      {byCategory.map(([cat, skills]) => (
        <section key={cat} className="mb-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--mx-muted)]">{cat}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => <SkillCard key={s.ref} skill={s} onOpen={() => setOpenRef(s.ref)} />)}
          </div>
        </section>
      ))}
      {openSkill && <SkillDrawer skill={openSkill} onClose={() => setOpenRef(null)} />}
    </div>
  );
};
```

- [ ] **Step 2 sanity build (optional):** `npm run web:build` will still fail until `ScenesView` exists (Task 12). Proceed to Task 12, then build.

- [ ] **Step 4: Commit (deferred with Task 12)** — see Task 12 Step 5.

---

## Task 12: Scenes view + profile card + recipe editor + resolve preview

**Files:**
- Create: `webui/src/components/ProfileCard.tsx`
- Create: `webui/src/components/RecipeEditor.tsx`
- Create: `webui/src/components/ResolvePreview.tsx`
- Create: `webui/src/views/ScenesView.tsx`

- [ ] **Step 1: Create the ProfileCard**

```tsx
// webui/src/components/ProfileCard.tsx
import React from 'react';
import type { ProfileView } from '@shared/contract';

export const ProfileCard: React.FC<{ profile: ProfileView; onOpen: () => void }> = ({ profile, onOpen }) => (
  <button onClick={onOpen}
    className="flex flex-col gap-2 rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-5 text-left transition hover:border-[var(--mx-primary)]"
    style={{ boxShadow: 'var(--mx-shadow)' }}>
    <span className="text-base font-semibold">{profile.name}</span>
    <span className="text-sm text-[var(--mx-muted)]">{profile.skillCount} skills</span>
    {profile.boundPaths.length > 0 && (
      <div className="mt-1 flex flex-wrap gap-1.5">
        {profile.boundPaths.map((p) => (
          <span key={p} className="truncate rounded bg-[var(--mx-bg)] px-1.5 py-0.5 text-xs text-[var(--mx-muted)]" title={p}>{p}</span>
        ))}
      </div>
    )}
  </button>
);
```

- [ ] **Step 2: Create the RecipeEditor (three editable lists)**

```tsx
// webui/src/components/RecipeEditor.tsx
import React, { useState } from 'react';

const ListEditor: React.FC<{ title: string; items: string[]; onChange: (next: string[]) => void; suggestions?: string[] }> =
  ({ title, items, onChange, suggestions }) => {
    const [draft, setDraft] = useState('');
    const add = () => {
      const v = draft.trim();
      if (v && !items.includes(v)) onChange([...items, v]);
      setDraft('');
    };
    return (
      <div className="rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-4">
        <h4 className="mb-2 text-sm font-semibold">{title}</h4>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="flex items-center gap-1 rounded bg-[var(--mx-bg)] px-2 py-0.5 text-xs">
              {it}
              <button onClick={() => onChange(items.filter((x) => x !== it))} className="text-[var(--mx-muted)]">✕</button>
            </span>
          ))}
          {items.length === 0 && <span className="text-xs text-[var(--mx-muted)]">（空）</span>}
        </div>
        <div className="flex gap-2">
          <input list={`sugg-${title}`} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="新增…"
            className="flex-1 rounded border border-[var(--mx-border)] px-2 py-1 text-sm outline-none focus:border-[var(--mx-primary)]" />
          <button onClick={add} className="rounded bg-[var(--mx-primary)] px-3 py-1 text-sm text-white">加</button>
          {suggestions && <datalist id={`sugg-${title}`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
        </div>
      </div>
    );
  };

export const RecipeEditor: React.FC<{
  categories: string[]; extras: string[]; excludes: string[];
  allCategories: string[]; allRefs: string[];
  onChange: (patch: { categories?: string[]; extras?: string[]; excludes?: string[] }) => void;
}> = ({ categories, extras, excludes, allCategories, allRefs, onChange }) => (
  <div className="flex flex-col gap-3">
    <ListEditor title="categories" items={categories} suggestions={allCategories} onChange={(v) => onChange({ categories: v })} />
    <ListEditor title="extras" items={extras} suggestions={allRefs} onChange={(v) => onChange({ extras: v })} />
    <ListEditor title="excludes" items={excludes} suggestions={allRefs} onChange={(v) => onChange({ excludes: v })} />
  </div>
);
```

- [ ] **Step 3: Create the ResolvePreview (uses the shared resolveRecipe)**

```tsx
// webui/src/components/ResolvePreview.tsx
import React, { useMemo } from 'react';
import { resolveRecipe } from '@shared/resolveRecipe';
import type { ProfileRecipe } from '@shared/contract';

export const ResolvePreview: React.FC<{
  recipe: Pick<ProfileRecipe, 'categories' | 'extras' | 'excludes' | 'skills'>;
  catalogByCategory: Record<string, string[]>;
}> = ({ recipe, catalogByCategory }) => {
  const resolved = useMemo(() => resolveRecipe(recipe, catalogByCategory), [recipe, catalogByCategory]);
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ref of resolved) {
      const cat = ref.includes('/') ? ref.split('/')[0] : '(raw)';
      (map.get(cat) ?? map.set(cat, []).get(cat)!).push(ref);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resolved]);

  return (
    <div>
      <p className="mb-3 text-sm text-[var(--mx-muted)]">解析后生效 {resolved.length} 个 skill</p>
      {grouped.map(([cat, refs]) => (
        <section key={cat} className="mb-4">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--mx-muted)]">{cat}</h4>
          <div className="flex flex-wrap gap-1.5">
            {refs.map((ref) => (
              <span key={ref} className="rounded bg-[var(--mx-surface)] px-2 py-1 text-xs border border-[var(--mx-border)]">
                {ref.includes('/') ? ref.split('/').slice(1).join('/') : ref}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Create the ScenesView (grid → detail with editor + preview + save)**

```tsx
// webui/src/views/ScenesView.tsx
import React, { useMemo, useState } from 'react';
import type { AppState, ProfileRecipe } from '@shared/contract';
import { ProfileCard } from '../components/ProfileCard';
import { RecipeEditor } from '../components/RecipeEditor';
import { ResolvePreview } from '../components/ResolvePreview';
import { saveProfile } from '../api';

type Draft = Required<Pick<ProfileRecipe, 'name' | 'categories' | 'extras' | 'excludes' | 'skills'>>;

export const ScenesView: React.FC<{
  state: AppState; search: string; onSaved: () => void; onError: (msg: string) => void;
}> = ({ state, search, onSaved, onError }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const catalogByCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of state.categories) map[c.name] = c.skillRefs;
    return map;
  }, [state.categories]);
  const allRefs = useMemo(() => state.skills.map((s) => s.ref).sort(), [state.skills]);
  const allCategories = useMemo(() => state.categories.map((c) => c.name), [state.categories]);

  const open = (name: string) => {
    const p = state.profiles.find((x) => x.name === name)!;
    setSelected(name);
    setDraft({ name: p.name, categories: [...p.categories], extras: [...p.extras], excludes: [...p.excludes], skills: [...p.skills] });
    setDirty(false);
  };

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.profiles.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [state.profiles, search]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveProfile(draft.name, draft);
      setDirty(false);
      onSaved();
    } catch (e) {
      onError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!selected || !draft) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProfiles.map((p) => <ProfileCard key={p.name} profile={p} onOpen={() => open(p.name)} />)}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => setSelected(null)} className="text-sm text-[var(--mx-muted)]">← 返回</button>
        <h2 className="text-xl font-semibold">{draft.name}</h2>
        {dirty && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">未保存</span>}
        <button onClick={save} disabled={saving || !dirty}
          className="ml-auto rounded-full bg-[var(--mx-primary)] px-4 py-1.5 text-sm text-white disabled:opacity-40">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecipeEditor
          categories={draft.categories} extras={draft.extras} excludes={draft.excludes}
          allCategories={allCategories} allRefs={allRefs}
          onChange={(patch) => { setDraft({ ...draft, ...patch }); setDirty(true); }}
        />
        <ResolvePreview recipe={draft} catalogByCategory={catalogByCategory} />
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Verify the full frontend builds**

Run: `npm run web:build`
Expected: exit code 0; `webui/dist/index.html` regenerated. No TypeScript/resolve errors.

- [ ] **Step 6: Commit the frontend client, shell, and all views/components together**

```bash
git add webui/src/api.ts webui/src/App.tsx webui/src/components webui/src/views
git commit -m "feat(webui): add scenes/catalog views, recipe editor and live resolve preview"
```

---

## Task 13: Docs + final end-to-end verification

**Files:**
- Modify: `CLAUDE.md` (add web build note)
- Modify: `README.md` (document `spells web`)

- [ ] **Step 1: Document the web UI in CLAUDE.md**

Add to the `## Commands` section of `CLAUDE.md`:

```markdown
## Web UI

The repo now includes a frontend in `webui/` (Vite + React + Tailwind).

```bash
npm run web:build   # Build the web UI → webui/dist (required before `spells web`)
npm run web:dev     # Vite dev server :5173 (proxies /api → :4178)
spells web          # Serve webui/dist + /api, opens browser (use --no-open / --port <n>)
```

Shared API types live in `src/shared/` (Zod contract + `resolveRecipe`), imported by both the Node backend (`src/web/`) and the frontend (`webui/` via the `@shared` alias). `resolveRecipe` mirrors `scripts/materialize-profile.sh` so live preview matches server output exactly.
```

- [ ] **Step 2: Document `spells web` in README.md**

Add a `### spells web` subsection under the commands documentation in `README.md`:

```markdown
### `spells web`

Launch a local web UI to browse all skills, inspect each profile's resolved skill set, and edit a profile recipe (`categories` / `extras` / `excludes`) with a live resolve preview before writing back to JSON.

```bash
npm run web:build        # one-time / after frontend changes
spells web               # http://localhost:4178, opens browser
spells web --port 5000   # custom port (auto-increments if busy)
spells web --no-open     # do not open the browser
```
```

- [ ] **Step 3: Run the full backend test suite**

Run: `npm test`
Expected: all suites PASS, including the new `__tests__/shared/*`, `__tests__/web/*`, and `__tests__/commands/web.test.ts`.

- [ ] **Step 4: Run the full backend build**

Run: `npm run build`
Expected: `tsc` compiles `src/` (including `src/shared`, `src/web`, `src/commands/web.ts`) to `dist/` with no errors.

- [ ] **Step 5: Build the frontend**

Run: `npm run web:build`
Expected: exit code 0.

- [ ] **Step 6: Smoke-test the running server**

Run:
```bash
node dist/index.js web --no-open --port 4178 &
sleep 1
curl -s http://localhost:4178/api/state | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4178/
kill %1
```
Expected: `/api/state` returns JSON containing `"profiles"`; `/` returns `200`.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document spells web UI build and usage"
```

---

## Self-Review notes

- **Spec coverage:** contract (§5) → Task 2; resolveRecipe (§4, §9) → Task 3; frontmatter (§4, §9) → Task 4; SkillCatalogService incl. inProfiles/boundPaths/resolvedRefs (§5, §9) → Task 5; ProfileWriter Zod+business+backup+write (§5, §8, §9) → Task 6; HTTP server + routes + port retry + 4xx/500 (§5, §7, §8) → Task 7; `spells web` runWeb/registerWeb + dist-missing hint (§7, §9) → Task 8; Vite/React/Tailwind scaffold + tokens (§3, §6, §7) → Task 9; typed client + shell + view toggle + search + dirty (§6) → Task 10; Catalog view + drawer + badges (§6) → Task 11; Scenes view + 3-list editor + live preview + save (§6, §10) → Task 12; docs/risks (§11) → Task 13.
- **Editing model:** direct three-list control + live preview via shared `resolveRecipe` (§6 decision) — implemented in Tasks 3, 12. `skills[]` is preserved through the draft and PUT body (carried in `Draft`, written by ProfileWriter) and participates in preview, but is not exposed for editing (§6).
- **Error handling:** invalid shape / unknown ref/category → `ProfileValidationError` → 400 (Task 6, Task 7); write failure → 500 (Task 7); missing/malformed SKILL.md → name-only card (Task 5 `readFrontmatter` catch, Task 4 graceful parse).
- **Type consistency:** `getState`, `writeProfile`, `readMarkdown`, `resolveRecipe`, `parseFrontmatter`, `buildProfileView`, `buildCatalogByCategory`, `ProfileValidationError`, `createApiHandler`, `createServer`, `startServer`, `runWeb`, `registerWeb` are used with identical signatures across tasks. `ProfileView` includes `skills` (added to the schema in Task 2) so the frontend draft round-trips it.
