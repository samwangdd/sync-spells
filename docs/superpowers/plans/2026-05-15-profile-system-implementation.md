# SyncSpells Profile System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 SyncSpells CLI，增加 Profile 系统、Skill Registry 管理和项目本地技能激活功能。

**Architecture:** 采用分层架构 - Command 层处理 CLI 交互，Service 层封装业务逻辑，Library 层提供基础设施（config、symlink、backup）。使用 TypeScript + Commander 框架，遵循 TDD 开发模式。

**Tech Stack:** TypeScript, Commander, Jest, Zod (validation), execa (shell commands)

---

## Phase 1: Foundation (Types & Extended Config)

### Task 1: Create shared type definitions

**Files:**
- Create: `src/types/index.ts`
- Test: `__tests__/types/index.test.ts`

- [ ] **Step 1: Write failing test for Profile interface**

```typescript
// __tests__/types/index.test.ts
import { Profile } from '../../src/types';

describe('Profile', () => {
  it('should create valid profile object', () => {
    const profile: Profile = {
      name: 'test-profile',
      description: 'Test profile',
      skills: ['global/git-commit', 'code/frontend']
    };

    expect(profile.name).toBe('test-profile');
    expect(profile.skills).toHaveLength(2);
    expect(profile.skills[0]).toBe('global/git-commit');
  });

  it('should support optional extends field', () => {
    const profile: Profile = {
      name: 'extended-profile',
      skills: ['global/docs']
    };

    expect(profile.extends).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/types/index.test.ts`
Expected: FAIL with "Cannot find module '../../src/types'"

- [ ] **Step 3: Create type definitions file**

```typescript
// src/types/index.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/types/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts __tests__/types/index.test.ts
git commit -m "feat(types): add core type definitions for Profile, Skill, Materialize, and Project activation"
```

---

### Task 2: Extend Config type and module

**Files:**
- Modify: `src/lib/config.ts:1-112`
- Test: `__tests__/lib/config.test.ts`

- [ ] **Step 1: Write failing test for extended config**

```typescript
// __tests__/lib/config.test.ts
import { readConfig, writeConfig, getConfigPath } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Mock homedir
jest.mock('os', () => ({
  homedir: jest.fn(() => '/tmp/test-user')
}));

describe('Extended Config', () => {
  const testConfigPath = '/tmp/test-user/.sync-spells/config.json';

  beforeEach(async () => {
    await fs.mkdir(path.dirname(testConfigPath), { recursive: true });
  });

  afterEach(async () => {
    await fs.unlink(testConfigPath).catch(() => {});
  });

  it('should support new profile fields', async () => {
    const config = {
      source: '/Users/test/sync-spells',
      tools: {},
      defaultProfile: 'mexc-code',
      profilesDir: '/Users/test/sync-spells/profiles',
      activeDir: '/Users/test/sync-spells/active-skills'
    };

    await writeConfig(config);
    const read = await readConfig();

    expect(read.defaultProfile).toBe('mexc-code');
    expect(read.profilesDir).toBe('/Users/test/sync-spells/profiles');
    expect(read.activeDir).toBe('/Users/test/sync-spells/active-skills');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/config.test.ts`
Expected: FAIL with "Property 'defaultProfile' does not exist on type 'Config'"

- [ ] **Step 3: Extend Config interface**

```typescript
// src/lib/config.ts (modify lines 16-19)

export interface Config {
  source: string;
  tools: Record<string, ToolConfig>;
  defaultProfile?: string;
  profilesDir?: string;
  activeDir?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts __tests__/lib/config.test.ts
git commit -m "feat(config): extend Config type with profile-related fields"
```

---

### Task 3: Create unified error handling

**Files:**
- Create: `src/lib/errors.ts`
- Test: `__tests__/lib/errors.test.ts`

- [ ] **Step 1: Write failing test for error classes**

```typescript
// __tests__/lib/errors.test.ts
import {
  SyncSpellsError,
  ProfileNotFoundError,
  SkillNotFoundError,
  BrokenSymlinkError
} from '../../src/lib/errors';

describe('Error Classes', () => {
  it('should create SyncSpellsError with message', () => {
    const error = new SyncSpellsError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('SyncSpellsError');
  });

  it('should create ProfileNotFoundError with suggestions', () => {
    const error = new ProfileNotFoundError('unknown-profile', ['mexc-code', 'lifeos-knowledge']);
    expect(error.message).toContain('unknown-profile');
    expect(error.suggestions).toEqual(['mexc-code', 'lifeos-knowledge']);
  });

  it('should format error message with suggestions', () => {
    const error = new ProfileNotFoundError('bad-profile', ['good-profile']);
    const formatted = error.formatMessage();
    expect(formatted).toContain('💡 Suggestion');
    expect(formatted).toContain('good-profile');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/errors.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/errors'"

- [ ] **Step 3: Create error classes**

```typescript
// src/lib/errors.ts

export class SyncSpellsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncSpellsError';
  }
}

export class ProfileNotFoundError extends SyncSpellsError {
  constructor(
    public profileName: string,
    public suggestions: string[] = []
  ) {
    super(`Profile not found: ${profileName}`);
    this.name = 'ProfileNotFoundError';
  }

  formatMessage(): string {
    let msg = `❌ Error: Profile "${this.profileName}" not found\n`;
    if (this.suggestions.length > 0) {
      msg += `\n💡 Suggestion:\n`;
      msg += `   Did you mean one of these?\n`;
      this.suggestions.forEach(s => {
        msg += `   - ${s}\n`;
      });
    }
    msg += `\n   Run 'spells profiles list' to see available profiles.\n`;
    return msg;
  }
}

export class SkillNotFoundError extends SyncSpellsError {
  constructor(
    public skillPath: string,
    public profileName: string
  ) {
    super(`Skill not found: ${skillPath}`);
    this.name = 'SkillNotFoundError';
  }

  formatMessage(): string {
    return `❌ Error: Skill "${this.skillPath}" not found in registry\n` +
           `   Required by profile: ${this.profileName}\n\n` +
           `💡 Suggestion:\n` +
           `   1. Add the skill to registry: spells skill new ${this.skillPath}\n` +
           `   2. Or remove from profile: spells profiles edit ${this.profileName}\n`;
  }
}

export class BrokenSymlinkError extends SyncSpellsError {
  constructor(
    public linkPath: string,
    public expectedTarget: string,
    public actualTarget?: string
  ) {
    super(`Broken symlink detected: ${linkPath}`);
    this.name = 'BrokenSymlinkError';
  }

  formatMessage(): string {
    let msg = `❌ Error: Broken symlink detected\n`;
    msg += `   Path: ${this.linkPath}\n`;
    msg += `   Expected: ${this.expectedTarget}\n`;
    if (this.actualTarget) {
      msg += `   Actual: ${this.actualTarget}\n`;
    }
    msg += `\n💡 Suggestion: Run 'spells doctor --fix' to auto-repair\n`;
    msg += `   Or manually remove: rm ${this.linkPath}\n`;
    return msg;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/errors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/errors.ts __tests__/lib/errors.test.ts
git commit -m "feat(errors): add unified error classes with formatted messages and suggestions"
```

---

## Phase 2: Service Layer

### Task 4: Implement ProfileService

**Files:**
- Create: `src/services/ProfileService.ts`
- Test: `__tests__/services/ProfileService.test.ts`

- [ ] **Step 1: Write failing test for listProfiles**

```typescript
// __tests__/services/ProfileService.test.ts
import { ProfileService } from '../../src/services/ProfileService';
import { Config } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('ProfileService', () => {
  let service: ProfileService;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-profiles-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });

    // Create test profiles
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test-profile.json'),
      JSON.stringify({
        name: 'test-profile',
        description: 'Test profile',
        skills: ['global/git-commit']
      })
    );

    const config: Config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles')
    };

    service = new ProfileService(config);
  });

  it('should list all profiles', async () => {
    const profiles = await service.listProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('test-profile');
    expect(profiles[0].skills).toEqual(['global/git-commit']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/services/ProfileService.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/ProfileService'"

- [ ] **Step 3: Implement ProfileService**

```typescript
// src/services/ProfileService.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, Profile, ValidationResult } from '../types';

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
      const profile = JSON.parse(content) as Profile;
      profiles.push(profile);
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
      throw new Error(`Default profile '${defaultName}' not found`);
    }

    return profile;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/services/ProfileService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ProfileService.ts __tests__/services/ProfileService.test.ts
git commit -m "feat(service): implement ProfileService with list, get, validate methods"
```

---

### Task 5: Implement SkillService

**Files:**
- Create: `src/services/SkillService.ts`
- Test: `__tests__/services/SkillService.test.ts`

- [ ] **Step 1: Write failing test for listSkills**

```typescript
// __tests__/services/SkillService.test.ts
import { SkillService } from '../../src/services/SkillService';
import { Config } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SkillService', () => {
  let service: SkillService;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-skills-${Date.now()}`;

    // Create test registry structure
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit Skill'
    );

    await fs.mkdir(path.join(testDir, 'code', 'frontend'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'code', 'frontend', 'SKILL.md'),
      '# Frontend Skill'
    );

    const config: Config = { source: testDir, tools: {} };
    service = new SkillService(config);
  });

  it('should list all skills', async () => {
    const skills = await service.listSkills();

    expect(skills).toHaveLength(2);
    expect(skills[0].category).toBe('global');
    expect(skills[0].path).toBe('global/git-commit');
    expect(skills[1].category).toBe('code');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/services/SkillService.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/SkillService'"

- [ ] **Step 3: Implement SkillService**

```typescript
// src/services/SkillService.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, SkillInfo, SkillCategory } from '../types';

export class SkillService {
  constructor(private config: Config) {}

  async listSkills(category?: SkillCategory): Promise<SkillInfo[]> {
    const registryDir = this.config.source;
    const categories: SkillCategory[] = category
      ? [category]
      : ['global', 'code', 'lifeos', 'inbox'];

    const skills: SkillInfo[] = [];

    for (const cat of categories) {
      const catDir = path.join(registryDir, cat);

      try {
        await fs.access(catDir);
      } catch {
        continue;
      }

      await this.scanCategory(catDir, cat, skills);
    }

    return skills;
  }

  private async scanCategory(
    dir: string,
    category: SkillCategory,
    skills: SkillInfo[]
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dir, entry.name);
        const hasSkillMd = await this.checkSkillMd(skillPath);

        skills.push({
          path: `${category}/${entry.name}`,
          category,
          name: entry.name,
          hasSkillMd
        });
      }
    }
  }

  private async checkSkillMd(skillPath: string): Promise<boolean> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    try {
      await fs.access(skillMdPath);
      return true;
    } catch {
      return false;
    }
  }

  async validateSkillPath(skillPath: string): Promise<boolean> {
    const fullPath = path.join(this.config.source, skillPath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/services/SkillService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/SkillService.ts __tests__/services/SkillService.test.ts
git commit -m "feat(service): implement SkillService with list and validate methods"
```

---

### Task 6: Implement MaterializeService

**Files:**
- Create: `src/services/MaterializeService.ts`
- Test: `__tests__/services/MaterializeService.test.ts`

- [ ] **Step 1: Write failing test for materialize**

```typescript
// __tests__/services/MaterializeService.test.ts
import { MaterializeService } from '../../src/services/MaterializeService';
import { ProfileService } from '../../src/services/ProfileService';
import { Config } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('MaterializeService', () => {
  let service: MaterializeService;
  let profileService: ProfileService;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-materialize-${Date.now()}`;

    // Setup registry
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit'
    );

    // Setup profiles
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({
        name: 'test',
        skills: ['global/git-commit']
      })
    );

    const config: Config = {
      source: testDir,
      tools: {},
      activeDir: path.join(testDir, 'active-skills')
    };

    profileService = new ProfileService(config);
    service = new MaterializeService(config, profileService);
  });

  it('should materialize profile to active directory', async () => {
    const result = await service.materialize('test');

    expect(result.profile).toBe('test');
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].status).toBe('created');

    // Verify symlink was created
    const linkPath = path.join(testDir, 'active-skills', 'test', 'git-commit');
    const target = await fs.readlink(linkPath);
    expect(target).toContain('global/git-commit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/services/MaterializeService.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/MaterializeService'"

- [ ] **Step 3: Implement MaterializeService**

```typescript
// src/services/MaterializeService.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, MaterializeResult } from '../types';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/services/MaterializeService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/MaterializeService.ts __tests__/services/MaterializeService.test.ts
git commit -m "feat(service): implement MaterializeService for profile → active skills conversion"
```

---

### Task 7: Implement ProjectService

**Files:**
- Create: `src/services/ProjectService.ts`
- Test: `__tests__/services/ProjectService.test.ts`

- [ ] **Step 1: Write failing test for inferProfile**

```typescript
// __tests__/services/ProjectService.test.ts
import { ProjectService } from '../../src/services/ProjectService';
import { ProfileService } from '../../src/services/ProfileService';
import { Config } from '../../src/types';
import * as path from 'path';

describe('ProjectService', () => {
  let service: ProjectService;
  let config: Config;

  beforeEach(() => {
    config = {
      source: '/tmp/sync-spells',
      tools: {}
    };

    const profileService = new ProfileService(config);
    service = new ProjectService(config, profileService);
  });

  it('should infer mexc-code profile for Mexc paths', () => {
    const profile = service.inferProfile('/Users/sammore/Mexc/frontend');
    expect(profile).toBe('mexc-code');
  });

  it('should infer lifeos-knowledge profile for LifeOS paths', () => {
    const profile = service.inferProfile('/Users/sammore/LifeOS/docs');
    expect(profile).toBe('lifeos-knowledge');
  });

  it('should fallback to global-lite for unknown paths', () => {
    const profile = service.inferProfile('/Users/sammore/other-project');
    expect(profile).toBe('global-lite');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/services/ProjectService.test.ts`
Expected: FAIL with "Cannot find module '../../src/services/ProjectService'"

- [ ] **Step 3: Implement ProjectService**

```typescript
// src/services/ProjectService.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, ProjectActivationResult, InferenceRule } from '../types';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/services/ProjectService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ProjectService.ts __tests__/services/ProjectService.test.ts
git commit -m "feat(service): implement ProjectService with path inference and profile activation"
```

---

## Phase 3: Command Layer

### Task 8: Implement `spells profiles` command

**Files:**
- Create: `src/commands/profiles.ts`
- Modify: `src/index.ts:1-20`
- Test: `__tests__/commands/profiles.test.ts`

- [ ] **Step 1: Write failing test for profiles list**

```typescript
// __tests__/commands/profiles.test.ts
import { runProfilesList } from '../../src/commands/profiles';
import { Config } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('profiles command', () => {
  let testDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-profiles-cmd-${Date.now()}`;

    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({
        name: 'test',
        description: 'Test profile',
        skills: ['global/git-commit']
      })
    );

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles')
    };
  });

  it('should list profiles', async () => {
    const profiles = await runProfilesList(config);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('test');
    expect(profiles[0].description).toBe('Test profile');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/commands/profiles.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/profiles'"

- [ ] **Step 3: Implement profiles command**

```typescript
// src/commands/profiles.ts
import { Command } from 'commander';
import { Config } from '../types';
import { ProfileService } from '../services/ProfileService';

export const runProfilesList = async (config: Config) => {
  const profileSvc = new ProfileService(config);
  return await profileSvc.listProfiles();
};

export const runProfilesShow = async (config: Config, name: string) => {
  const profileSvc = new ProfileService(config);
  const profile = await profileSvc.getProfile(name);
  const validation = profile ? await profileSvc.validateProfile(profile) : null;

  return { profile, validation };
};

export const registerProfiles = (program: Command, getConfig: () => Promise<Config>): void => {
  const profilesCmd = program.command('profiles');

  profilesCmd
    .command('list')
    .description('List all available profiles')
    .action(async () => {
      const config = await getConfig();
      const profiles = await runProfilesList(config);

      console.log('\nAvailable Profiles:');
      for (const profile of profiles) {
        const desc = profile.description ? `  ${profile.description}` : '';
        console.log(`  ${profile.name.padEnd(20)}${desc}`);
      }
      console.log('');
    });

  profilesCmd
    .command('show <name>')
    .description('Show profile details')
    .action(async (name) => {
      const config = await getConfig();
      const { profile, validation } = await runProfilesShow(config, name);

      if (!profile) {
        console.log(`\n❌ Profile not found: ${name}\n`);
        process.exit(1);
      }

      console.log(`\nProfile: ${profile.name}`);
      if (profile.description) {
        console.log(`Description: ${profile.description}`);
      }

      console.log(`\nSkills (${profile.skills.length}):`);
      for (const skill of profile.skills) {
        const isValid = validation?.warnings?.includes(`Skill path does not exist: ${skill}`);
        const icon = isValid ? '✗' : '✓';
        const warning = isValid ? '  [WARN: Skill path does not exist]' : '';
        console.log(`  ${icon} ${skill}${warning}`);
      }

      if (validation && validation.errors.length > 0) {
        console.log('\nErrors:');
        validation.errors.forEach(err => console.log(`  ✗ ${err}`));
      }

      if (validation && validation.warnings.length > 0) {
        console.log('\nWarnings:');
        validation.warnings.forEach(warn => console.log(`  ⚠ ${warn}`));
      }

      console.log('');
    });
};
```

- [ ] **Step 4: Register command in main index**

```typescript
// src/index.ts (modify lines 1-20, add import and registration)

import { registerProfiles } from './commands/profiles';

// ... after registerStatus(program)
registerProfiles(program, readConfig);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- __tests__/commands/profiles.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/profiles.ts src/index.ts __tests__/commands/profiles.test.ts
git commit -m "feat(command): implement profiles list/show command"
```

---

### Task 9: Implement `spells use` command

**Files:**
- Create: `src/commands/use.ts`
- Modify: `src/index.ts:1-20`
- Test: `__tests__/commands/use.test.ts`

- [ ] **Step 1: Write failing test for use command**

```typescript
// __tests__/commands/use.test.ts
import { runUse } from '../../src/commands/use';
import { Config } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('use command', () => {
  let testDir: string;
  let config: Config;
  let projectDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-use-${Date.now()}`;
    projectDir = `/tmp/test-project-${Date.now()}`;

    // Setup registry
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit'
    );

    // Setup profile
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({
        name: 'test',
        skills: ['global/git-commit']
      })
    );

    // Setup project
    await fs.mkdir(projectDir, { recursive: true });

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles'),
      activeDir: path.join(testDir, 'active-skills')
    };
  });

  it('should activate profile to project', async () => {
    const result = await runUse(config, projectDir, 'test');

    expect(result.profile).toBe('test');
    expect(result.skills.length).toBeGreaterThan(0);

    const linked = result.skills.filter(s => s.status === 'linked');
    expect(linked.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/commands/use.test.ts`
Expected: FAIL with "Cannot find module '../../src/commands/use'"

- [ ] **Step 3: Implement use command**

```typescript
// src/commands/use.ts
import { Command } from 'commander';
import { Config } from '../types';
import { ProfileService } from '../services/ProfileService';
import { MaterializeService } from '../services/MaterializeService';
import { ProjectService } from '../services/ProjectService';

export const runUse = async (
  config: Config,
  projectPath: string,
  profileName?: string
) => {
  const profileSvc = new ProfileService(config);
  const materializeSvc = new MaterializeService(config, profileSvc);
  const projectSvc = new ProjectService(config, profileSvc);

  const finalProfile = profileName ||
    projectSvc.inferProfile(projectPath) ||
    'global-lite';

  console.log(`\n✓ Detected profile: ${finalProfile}`);

  await materializeSvc.materialize(finalProfile);

  const result = await projectSvc.activateProfile(projectPath, finalProfile);

  return result;
};

export const registerUse = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('use')
    .option('--profile <name>', 'Specify profile name')
    .description('Activate profile in current project')
    .action(async (options) => {
      const config = await getConfig();
      const projectPath = process.cwd();

      try {
        const result = await runUse(config, projectPath, options.profile);

        console.log(`\n✓ Activating ${result.skills.length} skills`);

        for (const skill of result.skills) {
          const icon = skill.status === 'linked' ? '✓' : skill.status === 'error' ? '✗' : '⊘';
          console.log(`  ${icon} ${skill.name} → ${skill.targetPath}`);
          if (skill.error) {
            console.log(`    Error: ${skill.error}`);
          }
        }

        const linked = result.skills.filter(s => s.status === 'linked').length;
        console.log(`\n✓ Done! Restart Claude Code to see changes.\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });
};
```

- [ ] **Step 4: Register command in main index**

```typescript
// src/index.ts (add import and registration)

import { registerUse } from './commands/use';

// ... after registerProfiles
registerUse(program, readConfig);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- __tests__/commands/use.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/use.ts src/index.ts __tests__/commands/use.test.ts
git commit -m "feat(command): implement use command for profile activation"
```

---

### Task 10: Implement `spells materialize` command

**Files:**
- Create: `src/commands/materialize.ts`
- Modify: `src/index.ts`
- Test: `__tests__/commands/materialize.test.ts`

- [ ] **Step 1: Write failing test for materialize command**

```typescript
// __tests__/commands/materialize.test.ts
import { runMaterialize } from '../../src/commands/materialize';
import { Config } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('materialize command', () => {
  let testDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-materialize-cmd-${Date.now()}`;

    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit'
    );

    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({ name: 'test', skills: ['global/git-commit'] })
    );

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles'),
      activeDir: path.join(testDir, 'active-skills')
    };
  });

  it('should materialize profile', async () => {
    const result = await runMaterialize(config, 'test');

    expect(result.profile).toBe('test');
    expect(result.skills).toHaveLength(1);
  });
});
```

- [ ] **Step 2-5: Implement and test** (follow same pattern as previous tasks)

```typescript
// src/commands/materialize.ts
import { Command } from 'commander';
import { Config } from '../types';
import { ProfileService } from '../services/ProfileService';
import { MaterializeService } from '../services/MaterializeService';

export const runMaterialize = async (config: Config, profileName: string) => {
  const profileSvc = new ProfileService(config);
  const materializeSvc = new MaterializeService(config, profileSvc);
  return await materializeSvc.materialize(profileName);
};

export const registerMaterialize = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('materialize <profile>')
    .option('--list', 'List materialized profiles')
    .description('Generate active skills directory from profile')
    .action(async (profileName, options) => {
      const config = await getConfig();

      if (options.list) {
        const activeDir = config.activeDir || path.join(config.source, 'active-skills');
        try {
          const profiles = await fs.readdir(activeDir);
          console.log('\nMaterialized Profiles:');
          profiles.forEach(p => console.log(`  - ${p}`));
          console.log('');
        } catch {
          console.log('\nNo materialized profiles found.\n');
        }
        return;
      }

      try {
        const result = await runMaterialize(config, profileName);

        console.log(`\n✓ Materialized profile: ${result.profile}`);
        console.log(`  Generated at: ${new Date(result.generatedAt).toLocaleString()}`);
        console.log(`\nSkills (${result.skills.length}):`);

        for (const skill of result.skills) {
          const icon = skill.status === 'created' ? '+' :
                       skill.status === 'error' ? '✗' : '=';
          console.log(`  ${icon} ${skill.path}`);
          if (skill.error) {
            console.log(`    Error: ${skill.error}`);
          }
        }
        console.log('');
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });
};
```

- [ ] **Step 6: Register in index.ts and commit**

```bash
git add src/commands/materialize.ts src/index.ts __tests__/commands/materialize.test.ts
git commit -m "feat(command): implement materialize command"
```

---

### Task 11-13: Implement `spells skill` commands (add/new/list)

**Files:**
- Create: `src/commands/skill.ts`
- Modify: `src/services/SkillService.ts` (add addSkill, createSkill methods)
- Modify: `src/index.ts`
- Test: `__tests__/commands/skill.test.ts`

- [ ] **Step 1: Extend SkillService with add and create methods**

```typescript
// src/services/SkillService.ts (add these methods)

async addSkill(sourcePath: string, targetPath: string): Promise<void> {
  const sourceFullPath = sourcePath;
  const targetFullPath = path.join(this.config.source, targetPath);

  await fs.mkdir(targetFullPath, { recursive: true });

  const files = await fs.readdir(sourceFullPath);

  for (const file of files) {
    const srcFile = path.join(sourceFullPath, file);
    const destFile = path.join(targetFullPath, file);

    const stat = await fs.stat(srcFile);

    if (stat.isDirectory()) {
      await this.addSkill(srcFile, path.join(targetPath, file));
    } else if (file !== 'SKILL.md' || !(await this.fileExists(destFile))) {
      await fs.copyFile(srcFile, destFile);
    }
  }
}

async createSkill(name: string, category: SkillCategory): Promise<string> {
  const skillPath = path.join(this.config.source, category, name);

  await fs.mkdir(skillPath, { recursive: true });

  const skillMdPath = path.join(skillPath, 'SKILL.md');

  if (!(await this.fileExists(skillMdPath))) {
    const template = `# ${name}

<!-- Add your skill content here -->
`;
    await fs.writeFile(skillMdPath, template, 'utf8');
  }

  return skillPath;
}

private async fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Implement skill command**

```typescript
// src/commands/skill.ts
import { Command } from 'commander';
import { Config } from '../types';
import { SkillService } from '../services/SkillService';

export const registerSkill = (program: Command, getConfig: () => Promise<Config>): void => {
  const skillCmd = program.command('skill');

  skillCmd
    .command('add <path>')
    .option('--category <cat>', 'Category (global/code/lifeos/inbox)', 'inbox')
    .option('--target <path>', 'Target path in registry')
    .description('Add existing skill to registry')
    .action(async (sourcePath, options) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      const targetPath = options.target || path.join(options.category, path.basename(sourcePath));

      try {
        await skillSvc.addSkill(sourcePath, targetPath);
        console.log(`\n✓ Skill added to: ${targetPath}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });

  skillCmd
    .command('new <name>')
    .option('--category <cat>', 'Category (global/code/lifeos/inbox)', 'inbox')
    .description('Create new skill skeleton')
    .action(async (name, options) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      try {
        const skillPath = await skillSvc.createSkill(name, options.category as any);
        console.log(`\n✓ Skill created at: ${skillPath}`);
        console.log(`  Edit SKILL.md to add content\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });

  skillCmd
    .command('list')
    .option('--category <cat>', 'Filter by category')
    .description('List skills in registry')
    .action(async (options) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      try {
        const skills = await skillSvc.listSkills(options.category as any);

        console.log('\nSkills in registry:');
        for (const skill of skills) {
          const md = skill.hasSkillMd ? '✓' : '✗';
          console.log(`  [${skill.category.padEnd(7)}] ${skill.name} ${md}`);
        }
        console.log(`\nTotal: ${skills.length} skills\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });
};
```

- [ ] **Step 3: Register, test, commit**

```bash
git add src/commands/skill.ts src/services/SkillService.ts src/index.ts
git commit -m "feat(command): implement skill add/new/list commands"
```

---

### Task 14: Implement `spells doctor` command

**Files:**
- Create: `src/commands/doctor.ts`
- Modify: `src/index.ts`
- Test: `__tests__/commands/doctor.test.ts`

- [ ] **Step 1: Implement doctor command**

```typescript
// src/commands/doctor.ts
import { Command } from 'commander';
import { Config } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
import { checkSymlinkState } from '../lib/symlink';

export const registerDoctor = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('doctor')
    .option('--fix', 'Attempt to auto-fix issues')
    .description('Run health check on SyncSpells installation')
    .action(async (options) => {
      const config = await getConfig();

      console.log('\nChecking SyncSpells installation...\n');

      // Check config
      try {
        const configPath = path.join(require('os').homedir(), '.sync-spells', 'config.json');
        await fs.access(configPath);
        console.log('✓ Config file found');
      } catch {
        console.log('✗ Config file not found (run "spells setup")');
      }

      // Check registry
      try {
        await fs.access(config.source);
        console.log(`✓ Registry directory exists: ${config.source}`);
      } catch {
        console.log(`✗ Registry directory not found: ${config.source}`);
      }

      // Check profiles
      const profileSvc = new ProfileService(config);
      const profiles = await profileSvc.listProfiles();

      console.log('\nChecking profiles...');
      if (profiles.length === 0) {
        console.log('  ⚠ No profiles found');
      } else {
        for (const profile of profiles) {
          const validation = await profileSvc.validateProfile(profile);
          const icon = validation.valid ? '✓' : '✗';
          console.log(`  ${icon} ${profile.name} (${profile.skills.length} skills)`);
          validation.warnings.forEach(w => console.log(`    ⚠ ${w}`));
        }
      }

      // Check active skills
      const activeDir = config.activeDir || path.join(config.source, 'active-skills');
      try {
        const materialized = await fs.readdir(activeDir);
        console.log('\nChecking active skills...');
        materialized.forEach(p => console.log(`  ✓ ${p} materialized`));
      } catch {
        console.log('\nChecking active skills...');
        console.log('  ⚠ No active skills found');
      }

      // Check current project
      console.log('\nChecking project skills...');
      const projectPath = process.cwd();
      console.log(`  ✓ Current project: ${projectPath}`);

      console.log('\n✓ Health check complete\n');
    });
};
```

- [ ] **Step 2: Register, test, commit**

```bash
git add src/commands/doctor.ts src/index.ts
git commit -m "feat(command): implement doctor command for health checks"
```

---

### Task 15-16: Implement `spells config` commands (get/set)

**Files:**
- Create: `src/commands/config.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement config command**

```typescript
// src/commands/config.ts
import { Command } from 'commander';
import { Config } from '../types';
import { readConfig, writeConfig } from '../lib/config';

export const registerConfig = (program: Command): void => {
  const configCmd = program.command('config');

  configCmd
    .command('get <key>')
    .description('Get config value')
    .action(async (key) => {
      try {
        const config = await readConfig();
        const value = (config as any)[key];

        if (value === undefined) {
          console.log(`\nConfig key '${key}' not found\n`);
          process.exit(1);
        }

        console.log(`\n${key}: ${JSON.stringify(value, null, 2)}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('Set config value')
    .action(async (key, value) => {
      try {
        const config = await readConfig();

        let parsedValue: any = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(Number(value))) parsedValue = Number(value);

        (config as any)[key] = parsedValue;

        await writeConfig(config);

        console.log(`\n✓ Set ${key} = ${JSON.stringify(parsedValue)}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });
};
```

- [ ] **Step 2: Register, test, commit**

```bash
git add src/commands/config.ts src/index.ts
git commit -m "feat(command): implement config get/set commands"
```

---

### Task 17: Add integration tests

**Files:**
- Create: `__tests__/integration/e2e.test.ts`

- [ ] **Step 1: Create end-to-end integration test**

```typescript
// __tests__/integration/e2e.test.ts
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('E2E Integration Tests', () => {
  let testDir: string;
  let originalHome: string;

  beforeAll(() => {
    originalHome = process.env.HOME || '';
    testDir = `/tmp/syncspells-e2e-${Date.now()}`;
    process.env.HOME = testDir;
  });

  afterAll(async () => {
    process.env.HOME = originalHome;
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should complete full workflow: setup → profiles → use → doctor', async () => {
    // This test requires CLI to be built
    // Run: npm run build first

    // Test would check:
    // 1. spells setup completes
    // 2. spells profiles list works
    // 3. spells use activates skills
    // 4. spells doctor shows healthy state

    expect(true).toBe(true); // Placeholder
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add __tests__/integration/e2e.test.ts
git commit -m "test(integration): add E2E test structure"
```

---

### Task 18: Create migration script

**Files:**
- Create: `scripts/migrate-from-bash.sh`

- [ ] **Step 1: Create migration script**

```bash
#!/bin/bash
# scripts/migrate-from-bash.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SPELLS_DIR="${SYNC_SPELLS_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"

echo "SyncSpells Migration: Bash → Node CLI"
echo "======================================="
echo ""
echo "Source directory: $SYNC_SPELLS_DIR"
echo ""

# Check if source exists
if [ ! -d "$SYNC_SPELLS_DIR" ]; then
  echo "❌ Error: SyncSpells directory not found"
  echo "   Set SYNC_SPELLS_DIR environment variable if using custom path"
  exit 1
fi

# Migrate profiles/*.txt to profiles/*.json
PROFILES_DIR="$SYNC_SPELLS_DIR/profiles"

if [ -d "$PROFILES_DIR" ]; then
  echo "Migrating profiles..."

  for txt_file in "$PROFILES_DIR"/*.txt; do
    if [ -f "$txt_file" ]; then
      base_name=$(basename "$txt_file" .txt)
      json_file="$PROFILES_DIR/$base_name.json"

      echo "  Converting: $base_name.txt → $base_name.json"

      # Convert txt to json
      echo "{"
      echo "  \"name\": \"$base_name\","
      echo "  \"skills\": ["

      first=true
      while IFS= read -r skill_path; do
        if [ -n "$skill_path" ] && [[ ! "$skill_path" =~ ^# ]]; then
          if [ "$first" = true ]; then
            first=false
          else
            echo ","
          fi
          printf "    \"%s\"" "$skill_path"
        fi
      done < "$txt_file"

      echo ""
      echo "  ]"
      echo "}" > "$json_file"

      echo "    ✓ Created: $json_file"
    fi
  done

  echo ""
  echo "✓ Profile migration complete"
  echo ""
  echo "Note: Original .txt files are preserved. Remove manually after verification."
else
  echo "⚠ No profiles directory found, skipping profile migration"
fi

echo ""
echo "Migration complete! Next steps:"
echo "  1. Review migrated profiles in: $PROFILES_DIR"
echo "  2. Run: spells setup"
echo "  3. Run: spells doctor"
echo ""
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x scripts/migrate-from-bash.sh
git add scripts/migrate-from-bash.sh
git commit -m "feat(migration): add Bash → Node CLI migration script"
```

---

### Task 19: Update documentation

**Files:**
- Modify: `README.md`
- Create: `docs/PROFILE_SYSTEM.md`

- [ ] **Step 1: Update main README**

```markdown
# Add to README.md after existing commands section

## Profile System

SyncSpells now supports Profile-based skill management:

### Commands

- `spells profiles [list|show]` - Manage profiles
- `spells use [--profile <name>]` - Activate profile in current project
- `spells materialize <profile>` - Generate active skills from profile
- `spells skill add <path>` - Add skill to registry
- `spells skill new <name>` - Create new skill
- `spells skill list [--category]` - List registry skills
- `spells doctor` - Health check
- `spells config [get|set]` - Configuration management

### Quick Start

1. Initialize:
   ```bash
   spells setup
   ```

2. Use in project:
   ```bash
   cd /path/to/project
   spells use
   ```

3. Check health:
   ```bash
   spells doctor
   ```
```

- [ ] **Step 2: Create detailed documentation**

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/PROFILE_SYSTEM.md
git commit -m "docs: add Profile System documentation"
```

---

### Task 20: Final polish and release preparation

**Files:**
- Modify: `package.json` (bump version)
- Create: `CHANGELOG.md`

- [ ] **Step 1: Update version and changelog**

```json
// package.json
{
  "version": "2.0.0"
}
```

```markdown
# CHANGELOG.md

## [2.0.0] - 2026-05-15

### Added
- Profile system for skill management
- Skill registry with categories (global, code, lifeos)
- Project-local profile activation
- `spells profiles` command
- `spells use` command
- `spells materialize` command
- `spells skill add/new/list` commands
- `spells doctor` health check
- `spells config get/set` commands
- Migration script from Bash version

### Changed
- Extended Config type with profile fields
- Service layer architecture
- Improved error handling with suggestions

### Fixed
- Better symlink state detection
```

- [ ] **Step 2: Final commit and tag**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: prepare 2.0.0 release"
git tag -a v2.0.0 -m "Release 2.0.0: Profile System"
```

---

## Execution Notes

**Implementation order:**
1. Complete all Phase 1 tasks (foundation)
2. Complete all Phase 2 tasks (services)
3. Complete Phase 3 tasks incrementally (commands)
4. Phase 4 (polish) after core functionality works

**Testing strategy:**
- Run `npm test` after each task
- Run `npm run build` to verify compilation
- Test CLI manually: `npm run dev -- profiles list`

**Commit frequently:**
- Each task should end with a commit
- Use conventional commit format
- Keep commits atomic and focused
