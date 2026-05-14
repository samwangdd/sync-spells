# SyncSpells Profile & Skill Management System Design

**Date**: 2026-05-15
**Status**: Design Approved
**Author**: Design discussion with user
**Type**: Feature Enhancement

## Executive Summary

扩展现有 SyncSpells Node CLI，增加 Profile 系统和 Skill Registry 管理功能，支持：
- 基于 Profile 的技能组合管理
- 结构化的 Skill Registry（global、code、lifeos）
- 项目本地的技能激活机制
- 完整的 skill 生命周期管理（add、new、list、validate）
- 健康检查和诊断工具

采用**渐进式扩展（方案 A）**策略，在现有架构基础上增量开发，保持向后兼容。

## 1. Architecture Overview

### 1.1 Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│  (commands/: setup, sync, profiles, use, materialize, etc) │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                      Service Layer                          │
│  ProfileService | SkillService | MaterializeService | ...  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                      Library Layer                          │
│  config | symlink | backup | errors | types                │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    File System                              │
│  ~/.sync-spells/ | ~/config.json | skills-registry/        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Concept Mapping

| Obsidian README Concept | CLI Implementation |
|------------------------|-------------------|
| `skills-registry/` | `source/` directory (config's source field) |
| `profiles/*.txt` | `profiles/*.json` (JSON format) |
| `active-skills/` | Runtime-generated temporary directory |
| `~/.claude/skills/` | Project-local symlink targets |

## 2. Core Data Models

### 2.1 Extended Config Structure

```typescript
interface Config {
  // Existing fields
  source: string;              // Registry root directory (may be iCloud path)
  tools: Record<string, ToolConfig>;

  // New fields
  defaultProfile?: string;     // Default profile name
  profilesDir?: string;        // Profiles directory (default: source/profiles)
  activeDir?: string;          // Active skills generation directory (default: source/active-skills)
}

interface ToolConfig {
  enabled: boolean;
  configPath: string;
  mappings: ToolMapping[];
}
```

### 2.2 Profile Model

```typescript
interface Profile {
  name: string;              // Profile name, e.g. "mexc-code"
  description?: string;      // Optional description
  skills: string[];          // Registry-relative path list
  extends?: string;          // Optional: inherit from another profile
}

// Example: profiles/mexc-code.json
{
  "name": "mexc-code",
  "description": "MEXC 前端代码项目",
  "skills": [
    "global/git-commit",
    "global/docs",
    "code/frontend",
    "lifeos/task-agent"
  ]
}
```

### 2.3 Skill Registry Structure

```
source/ (registry)
├── global/           // Global universal skills
│   ├── git-commit/
│   └── docs/
├── code/             // All coding-related skills
│   ├── frontend/
│   ├── backend/
│   └── (all coding skills)
├── lifeos/           // All LifeOS-related skills (management, docs, knowledge, no coding)
│   ├── twitter-style/
│   ├── chrome-ext-icons/
│   └── voiceover-script/
└── inbox/            // Uncategorized temporary storage
```

### 2.4 Materialize Result Models

```typescript
interface MaterializeResult {
  profile: string;
  generatedAt: string;
  skills: {
    path: string;            // Registry-relative path
    symlinkPath: string;     // Absolute path in active directory
    status: 'created' | 'updated' | 'error';
    error?: string;
  }[];
}

interface ProjectActivationResult {
  projectPath: string;
  profile: string;
  skills: {
    name: string;
    targetPath: string;      // .claude/skills/xxx or .codex/skills/xxx
    status: 'linked' | 'skipped' | 'error';
    error?: string;
  }[];
}
```

## 3. Service Layer Design

### 3.1 ProfileService

Responsible for Profile reading, validation, listing, and management.

```typescript
class ProfileService {
  constructor(private config: Config) {}

  // List all available profiles
  listProfiles(): Promise<Profile[]>;

  // Get single profile by name
  getProfile(name: string): Promise<Profile | null>;

  // Validate profile structure and skill path validity
  validateProfile(profile: Profile): Promise<ValidationResult>;

  // Get default profile
  getDefaultProfile(): Promise<Profile>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];  // e.g., skill path doesn't exist but profile still valid
}
```

### 3.2 SkillService

Responsible for Skill scanning, adding, creating, and validation.

```typescript
class SkillService {
  constructor(private config: Config) {}

  // List all skills in registry
  listSkills(category?: 'global' | 'code' | 'lifeos' | 'inbox'): Promise<SkillInfo[]>;

  // Add existing skill to registry
  addSkill(sourcePath: string, targetPath: string): Promise<void>;

  // Create new skill skeleton
  createSkill(name: string, category: SkillCategory): Promise<string>;

  // Validate if skill path exists
  validateSkillPath(skillPath: string): Promise<boolean>;
}

interface SkillInfo {
  path: string;           // Registry-relative path
  category: 'global' | 'code' | 'lifeos' | 'inbox';
  name: string;
  hasSkillMd: boolean;
}

type SkillCategory = 'global' | 'code' | 'lifeos' | 'inbox';
```

### 3.3 MaterializeService

Responsible for converting Profiles to active skills directories.

```typescript
class MaterializeService {
  constructor(private config: Config, private profileSvc: ProfileService) {}

  // Generate active skills directory from profile
  materialize(profileName: string): Promise<MaterializeResult>;

  // Clean up specified active directory
  cleanup(profileName: string): Promise<void>;

  // List materialized profiles
  listMaterialized(): Promise<string[]>;
}
```

### 3.4 ProjectService

Responsible for project-local skill management.

```typescript
class ProjectService {
  constructor(private config: Config, private profileSvc: ProfileService) {}

  // Infer appropriate profile based on project path
  inferProfile(projectPath: string): string | null;

  // Activate profile to project-local (create symlinks to .claude/skills)
  activateProfile(projectPath: string, profileName: string): Promise<ProjectActivationResult>;

  // Check currently active profile in project
  getActiveProfile(projectPath: string): Promise<string | null>;
}

// Default inference rules
const DEFAULT_INFERENCE_RULES: InferenceRule[] = [
  { pattern: /Mexc/i, profile: 'mexc-code' },
  { pattern: /lifeOS|🏝️lifeOS/i, profile: 'lifeos-knowledge' },
  { pattern: /.*/, profile: 'global-lite' }  // fallback
];
```

## 4. Command Layer Design

### 4.1 New Commands Summary

| Command | Function | Service |
|---------|----------|---------|
| `spells profiles [list\|show]` | Profile management | ProfileService |
| `spells use [--profile <name>]` | Activate profile to current project | ProjectService |
| `spells materialize <profile>` | Manually trigger materialize | MaterializeService |
| `spells skill add <path>` | Add existing skill | SkillService |
| `spells skill new <name>` | Create new skill skeleton | SkillService |
| `spells doctor` | Health check | All Services |
| `spells config [get\|set]` | Config management | Config extension |

### 4.2 Command Details

#### 4.2.1 `spells profiles`

```bash
# List all profiles
spells profiles list

# Show specific profile details
spells profiles show mexc-code
```

**Output Example**:
```bash
$ spells profiles list

Available Profiles:
  mexc-code         MEXC 前端项目
  lifeos-knowledge  LifeOS 知识管理工作
  global-lite       轻量级全局配置

$ spells profiles show mexc-code

Profile: mexc-code
Description: MEXC 前端项目
Skills (4):
  ✓ global/git-commit
  ✓ global/docs
  ✓ code/frontend
  ✗ lifeos/task-agent  [WARN: Skill path does not exist]
```

#### 4.2.2 `spells use`

```bash
# Auto-infer profile for current project
spells use

# Manually specify profile
spells use --profile mexc-code
```

**Output Example**:
```bash
$ spells use

✓ Detected profile: mexc-code (based on project path)
✓ Activating 4 skills to .claude/skills/
  ✓ global/git-commit → .claude/skills/git-commit
  ✓ global/docs → .claude/skills/docs
  ✓ code/frontend → .claude/skills/frontend
  ✗ lifeos/task-agent → skipped (path not found)

✓ Done! Restart Claude Code to see changes.
```

#### 4.2.3 `spells materialize`

```bash
# Manually materialize a profile
spells materialize mexc-code

# List materialized profiles
spells materialize --list
```

#### 4.2.4 `spells skill`

```bash
# Add existing skill to registry
spells skill add ./my-skill --category code --target code/my-skill

# Create new skill skeleton
spells skill new code/graphql-client

# List skills in registry
spells skill list [--category code]
```

#### 4.2.5 `spells doctor`

```bash
# Health check
spells doctor
```

**Output Example**:
```bash
$ spells doctor

Checking SyncSpells installation...

✓ Config file found at ~/.sync-spells/config.json
✓ Registry directory exists: ~/.../sync-spells
✓ Profiles directory exists

Checking profiles...
  ✓ mexc-code (4 skills, all valid)
  ✗ lifeos-knowledge (1 invalid skill)
    ✗ lifeos/missing-skill

Checking active skills...
  ✓ mexc-code materialized
  ✗ lifeos-knowledge not materialized (run 'spells materialize lifeos-knowledge')

Checking project skills...
  ✓ Current project: /Users/sammore/codeLab/sync-spells
  ✗ No active profile (run 'spells use')

Fix suggestions:
  1. Run 'spells materialize lifeos-knowledge'
  2. Run 'spells use' to activate profile in current project
  3. Remove invalid skill from profile or add to registry
```

#### 4.2.6 `spells config`

```bash
# View config
spells config get source

# Modify config
spells config set defaultProfile mexc-code
```

## 5. Data Flow & Workflows

### 5.1 Typical Workflow 1: New Project Initialization

```
User creates new project
  → cd project-dir
  → spells use
  → Path matching rules?
      ├─ Mexc → Use mexc-code profile
      ├─ LifeOS → Use lifeos-knowledge profile
      └─ Other → Use global-lite profile
  → MaterializeService.materialize()
      → Generate active-skills/<profile>/
  → ProjectService.activateProfile()
      → Create symlinks to .claude/skills/
  → ✓ Complete
```

### 5.2 Typical Workflow 2: Add New Skill

```
User develops new skill
  → spells skill add ./my-skill
  → Where should skill go in registry?
      ├─ code/ → Copy to source/code/my-skill/
      ├─ lifeos/ → Copy to source/lifeos/my-skill/
      └─ global/ → Copy to source/global/my-skill/
  → Select profile to add to
  → Update profiles/<profile>.json
  → spells materialize <profile>
  → ✓ Skill is now available
```

### 5.3 Data Flow: `spells use` Command

```
User executes: spells use --profile mexc-code

1. ProjectService.inferProfile()
   └─> Check if current path matches Mexc rules

2. ProfileService.getProfile('mexc-code')
   └─> Read profiles/mexc-code.json
   └─> Return Profile { skills: [...] }

3. MaterializeService.materialize('mexc-code')
   └─> Read Profile.skills array
   └─> For each skill path:
       ├─> Verify source/<path> exists
       ├─> Create symlink: active-skills/mexc-code/<skill-name> → source/<path>
       └─> Record result

4. ProjectService.activateProfile(cwd, 'mexc-code')
   └─> Scan .claude/skills/ and .codex/skills/
   ├─> Preserve existing project-local skills
   ├─> Create symlink for each skill in profile
   └─> Record activation state to .sync-spells.json

5. Output result
   └─> Display success/failure statistics
   └─> Prompt to restart Claude Code
```

### 5.4 Error Handling Flow

```
When error occurs:
  1. Catch specific error type
  2. Generate friendly error message
  3. Provide fix suggestions
  4. Log detailed details (optional --debug)

Example:
Error: Broken symlink detected
  Path: ~/.claude/skills/git-commit
  Expected: ~/.../global/git-commit
  Actual: ~/.../global/git-commit-old

💡 Suggestion: Run 'spells doctor --fix' to auto-repair
   Or manually remove: rm ~/.claude/skills/git-commit
```

## 6. Implementation Plan

### Phase 1: Foundation (1-2 weeks)

**Goal**: Extend Config and basic Service layer

**Tasks**:
1. Extend `Config` type definition (add profiles, registry fields)
2. Implement `ProfileService` (read, validate, list)
3. Implement `SkillService` (scan, validate)
4. Add unit tests

**Deliverables**:
- ✅ New Config structure
- ✅ ProfileService and SkillService basic functionality
- ✅ Test coverage > 80%

### Phase 2: Core Commands (2-3 weeks)

**Goal**: Implement profiles, use, materialize commands

**Tasks**:
1. Implement `MaterializeService`
2. Implement `ProjectService` (include path inference)
3. Implement `spells profiles` command
4. Implement `spells use` command
5. Implement `spells materialize` command
6. Integration tests

**Deliverables**:
- ✅ Complete profile management functionality
- ✅ Project-local skill activation
- ✅ E2E tests

### Phase 3: Skill Management & Diagnostics (1-2 weeks)

**Goal**: Implement skill add/new and doctor commands

**Tasks**:
1. Extend `SkillService` (add, create)
2. Implement `spells skill add/new/list` commands
3. Implement `spells doctor` command
4. Implement `spells config get/set` commands
5. Improve error handling and user prompts

**Deliverables**:
- ✅ Complete skill management functionality
- ✅ Health check tools
- ✅ Configuration management tools

### Phase 4: Documentation & Polish (1 week)

**Goal**: Complete documentation and optimize UX

**Tasks**:
1. Write CLI usage documentation
2. Write migration guide (from Bash version)
3. Add `--help` and examples
4. Performance optimization (if needed)
5. Error message refinement

## 7. Backward Compatibility Strategy

### 7.1 Compatible with Existing Workflows

```bash
# Existing commands continue to work
spells setup    # Interactive config, add new profile options
spells sync     # Continue to support basic sync functionality
spells status   # Extended to show profile information
spells push     # Unchanged
```

### 7.2 Migration Path

For users using the Bash version, provide migration script:

```bash
# scripts/migrate-from-bash.sh
# 1. Read existing profiles/*.txt
# 2. Convert to profiles/*.json
# 3. Migrate active-skills/ structure
# 4. Update ~/.sync-spells/config.json
```

## 8. Testing Strategy

### 8.1 Unit Tests

- Each Service method has corresponding test
- Use Jest's mock feature to isolate file system operations
- Coverage target: > 80%

### 8.2 Integration Tests

- Test complete command flows (e.g., `spells use`)
- Use temporary directories to simulate real file system
- Test symlink creation and status checking

### 8.3 E2E Tests (Optional)

- Test key workflows in real environment
- Can be executed manually or with automated scripts

## 9. Technology Stack

- **Framework**: TypeScript + Commander
- **Validation**: Zod (config schema validation)
- **Process**: execa (cross-platform shell commands)
- **Testing**: Jest + ts-jest
- **Development**: ts-node / tsx

## 10. Success Criteria

- [ ] All planned commands implemented and tested
- [ ] Test coverage > 80%
- [ ] Migration guide completed
- [ ] CLI documentation completed
- [ ] Backward compatibility maintained
- [ ] Error messages are friendly and actionable
- [ ] Profile workflow works end-to-end
- [ ] Skill add/new/list functions work correctly
- [ ] `doctor` command can diagnose common issues

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing sync functionality | High | Comprehensive integration tests, keep existing code paths |
| Profile migration complexity | Medium | Provide migration script, detailed documentation |
| Symlink creation failures | Medium | Robust error handling, doctor command for diagnosis |
| iCloud sync delays | Low | Document limitations, add sync status checks |
| Complex profile inheritance | Low | Keep it simple (YAGNI), only add if needed |

## Appendix: Design Decisions

### Why JSON for profiles instead of plain text?
- Easier to parse and validate
- Supports additional metadata (description, extends)
- Better tooling support (editors, formatters)

### Why only 3 categories (global, code, lifeos)?
- Simpler to maintain
- Covers all use cases
- Can be extended later if needed

### Why service layer separation?
- Clear separation of concerns
- Easier to test
- Reusable across commands

### Why incremental approach (方案 A)?
- Lower risk
- Faster delivery
- Validates design before full commitment
