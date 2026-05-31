# SyncSpells Skill Management Simplification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `think-before-coding` before implementation. This plan intentionally reduces user-facing concepts while preserving existing data where possible. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SyncSpells 的用户心智模型从 “注册 Skill / Skills Market / Active Skills / Profile / 项目” 简化为 “Library / Preset / Project”，并通过兼容迁移保持现有 iCloud 数据、profile JSON、active-skills 链接可继续工作。

**Architecture:** 保留当前 Service 分层。`skills-registry` 继续作为真实 skill library；`profiles` 迁移为用户可见的 `presets` 概念；`active-skills` 降级为内部生成缓存，不再作为 CLI 和文档里的核心概念。

**Tech Stack:** TypeScript, Commander, Jest, Node fs/symlink APIs

---

## Target Mental Model

### User-facing concepts

| Concept | Meaning | Backing storage |
| --- | --- | --- |
| Library | 用户拥有的所有 skills | `skills-registry/` |
| Global | 跨 LiveOS 和 Coding 默认可用的公共 skills | `skills-registry/global/` |
| Preset | 一组 skills 的工作模式 | `profiles/*.json` initially, optional `presets/*.json` later |
| Project | 当前仓库使用哪个 preset | project `.claude/skills` and `.codex/skills` links |

### Hidden implementation details

| Current concept | New treatment |
| --- | --- |
| Registered Skill | A skill inside Library |
| Skills Market | Install source for Library |
| Active Skills | Generated cache, hidden from normal UX |
| Profile | Backward-compatible storage name, exposed as Preset |

### Physical Global Rule

Global is a real directory rule, not just a preset membership flag.

When a skill is made global, SyncSpells moves the skill directory into:

```text
skills-registry/global/<skill-name>/
```

Then it updates every preset/profile reference from the old registry-relative path to the new `global/<skill-name>` path.

Example:

```text
skills-registry/projects/lifeos/task-run/
  -> skills-registry/global/task-run/

profiles/lifeos.json:
  "projects/lifeos/task-run" -> "global/task-run"
```

If `global/<skill-name>` already exists, the command must stop with a clear conflict message unless a future explicit `--force` mode is added and tested.

---

## Phase 1: Rename UX Without Breaking Storage

### Task 1: Introduce Preset aliases for Profile commands

**Files:**
- Modify: `src/index.ts`
- Create or modify: `src/commands/presets.ts`
- Keep: `src/commands/profiles.ts`
- Tests: `__tests__/commands/presets.test.ts`, existing profile command tests

- [x] **Step 1: Add `spells preset` command group**

Expose the same operations currently available under `spells profiles`, but use Preset wording in command names and output.

Required commands:

```bash
spells preset list
spells preset show <name>
spells preset validate <name>
```

- [x] **Step 2: Keep `spells profiles` as a compatibility alias**

Existing scripts and docs may still call `spells profiles`. Do not remove it in this phase.

Compatibility behavior:

```bash
spells profiles list
spells profiles show <name>
```

Expected output may include a short deprecation hint, but should not fail.

- [x] **Step 3: Add tests for alias parity**

Verify `preset list` and `profiles list` read the same underlying profile JSON files.

- [x] **Step 4: Run tests**

```bash
npm test -- __tests__/commands/profiles.test.ts __tests__/commands/presets.test.ts
```

---

### Task 2: Update `spells use` wording from Profile to Preset

**Files:**
- Modify: `src/commands/use.ts`
- Modify as needed: `src/services/ProjectService.ts`
- Tests: `__tests__/commands/use.test.ts`, `__tests__/services/ProjectService.test.ts`

- [x] **Step 1: Add preferred invocation**

Preferred:

```bash
spells use <preset>
```

Compatibility:

```bash
spells use --profile <name>
```

If both are supplied, the positional preset should win only if existing Commander behavior is explicit and tested. Otherwise fail with a clear conflict error.

- [x] **Step 2: Update output language**

Use “preset” in human-readable output:

```text
Activating preset: coding
Linked 12 skills into this project.
```

Avoid exposing `active-skills` paths in normal output.

- [x] **Step 3: Persist project state**

If project state is written, prefer:

```json
{
  "activePreset": "coding"
}
```

Continue reading old `activeProfile` state for compatibility.

- [x] **Step 4: Run tests**

```bash
npm test -- __tests__/commands/use.test.ts __tests__/services/ProjectService.test.ts
```

---

## Phase 2: Hide Active Skills as Cache

### Task 3: Move active generation behind an internal cache abstraction

**Files:**
- Modify: `src/services/MaterializeService.ts`
- Modify: `src/lib/config.ts`
- Tests: `__tests__/services/MaterializeService.test.ts`, `__tests__/lib/config.test.ts`

- [x] **Step 1: Add internal naming helper**

Introduce a helper that resolves active skill cache directory in this order:

1. Existing `config.activeDir`
2. New `config.cacheDir/active-skills`
3. Default `<source>/.sync-spells-cache/active-skills`

This keeps current machines working because existing config already has `activeDir`.

- [x] **Step 2: Rename service language internally where low risk**

The service can remain `MaterializeService` for now, but comments and user-facing messages should say “cache” or “generated links,” not “active skills.”

- [x] **Step 3: Ensure generated cache is safe to rebuild**

Before regenerating a preset cache, remove stale links that are no longer part of the preset. Current implementation unlinks each target but does not necessarily clean removed skills from the preset cache.

- [x] **Step 4: Run tests**

```bash
npm test -- __tests__/services/MaterializeService.test.ts __tests__/lib/config.test.ts
```

---

### Task 4: Simplify status output

**Files:**
- Modify: `src/commands/status.ts`
- Tests: `__tests__/commands/status.test.ts`

- [x] **Step 1: Make project status primary**

Default `spells status` should answer:

```text
Project preset: coding
Skills linked: 12
Targets:
  .codex/skills
  .claude/skills
```

- [x] **Step 2: Move cache detail behind verbose mode**

Only show generated cache paths when explicitly requested:

```bash
spells status --verbose
```

- [x] **Step 3: Run tests**

```bash
npm test -- __tests__/commands/status.test.ts
```

---

## Phase 3: Library and Market Consolidation

### Task 5: Reframe skill commands around Library

**Files:**
- Modify: `src/commands/skill.ts`
- Modify: `src/services/SkillService.ts`
- Tests: `__tests__/commands/skill.test.ts`, `__tests__/services/SkillService.test.ts`

- [x] **Step 1: Keep existing skill commands**

Existing commands remain valid:

```bash
spells skill list
spells skill add <path>
spells skill new <name>
```

- [x] **Step 2: Update output wording**

Output should say “Library” instead of “registry” unless referring to an on-disk path.

Example:

```text
Library: 58 skills
Added to Library: global/foo
```

- [ ] **Step 3: Add optional alias** (skipped for this pass)

If useful, add:

```bash
spells library list
spells library add <path>
```

This should be a thin alias over `spells skill`, not a new service.

- [x] **Step 4: Run tests**

```bash
npm test -- __tests__/commands/skill.test.ts __tests__/services/SkillService.test.ts
```

---

### Task 6: Add physical globalize command

**Files:**
- Modify: `src/commands/skill.ts`
- Modify: `src/services/SkillService.ts`
- Modify as needed: `src/services/ProfileService.ts`
- Tests: `__tests__/commands/skill.test.ts`, `__tests__/services/SkillService.test.ts`, `__tests__/services/ProfileService.test.ts`

- [x] **Step 1: Add service operation**

Add a `globalizeSkill(skillPathOrName)` operation that:

1. Resolves the requested skill to exactly one Library path.
2. Moves the skill directory to `global/<skill-name>`.
3. Updates every JSON preset/profile reference from old path to new path.
4. Leaves the skill content unchanged.

Expected command:

```bash
spells skill globalize <skill>
```

Examples:

```bash
spells skill globalize projects/lifeos/task-run
spells skill globalize task-run
```

- [x] **Step 2: Handle ambiguous names**

If a bare skill name matches multiple paths, fail and show candidates:

```text
Ambiguous skill name: task-run
Candidates:
  projects/lifeos/task-run
  inbox/task-run
```

Require the user to rerun with a full Library path.

- [x] **Step 3: Handle existing global conflict**

If `skills-registry/global/<skill-name>` already exists, fail without moving anything.

Do not add `--force` in this pass.

- [x] **Step 4: Update preset/profile references atomically enough**

For each JSON profile/preset file:

- Replace exact skill path entries only.
- Preserve unrelated fields.
- Preserve valid JSON formatting with two-space indentation.
- If any write fails after the move, report the failed file and leave enough information for manual recovery.

Preferred behavior is to update references before moving when possible, then move, then verify all referenced paths exist.

- [x] **Step 5: Add tests**

Test cases:

- Moves `projects/lifeos/task-run` to `global/task-run`.
- Updates all profile JSON files that reference the old path.
- Does not modify profiles that do not reference the old path.
- Fails on ambiguous bare name.
- Fails when global target already exists.
- Fails when source skill does not exist.

- [x] **Step 6: Run tests**

```bash
npm test -- __tests__/commands/skill.test.ts __tests__/services/SkillService.test.ts __tests__/services/ProfileService.test.ts
```

---

### Task 7: Treat Skills Market as install source only

**Files:**
- Depends on current market implementation if present
- Tests: add only when market code exists

- [x] **Step 1: Audit current market code**

Search for market-related commands or docs:

```bash
rg -n "market|registry|install|skill add|skill new" src docs README*
```

- [x] **Step 2: Define the target UX**

Market should only appear during install/search flows:

```bash
spells skill search <query>
spells skill install <name>
```

After install, the skill is just part of Library.

- [x] **Step 3: Avoid adding a permanent Market concept to status/use**

Do not show Market in:

```bash
spells status
spells use
spells preset list
```

---

## Phase 4: Documentation and Migration

### Task 8: Update README around the three-concept model

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [x] **Step 1: Add one short concept section**

Chinese wording:

```text
SyncSpells 只有三个日常概念：
1. Library：所有可用 skill
2. Preset：一组 skill 的工作模式
3. Project：当前项目使用哪个 preset
```

- [x] **Step 2: Make quickstart use the simplified path**

Quickstart should prefer:

```bash
spells skill list
spells preset list
spells use coding
spells status
```

- [x] **Step 3: Move implementation details lower**

Mention `active-skills` only in an “Implementation notes” or troubleshooting section.

---

### Task 9: Add migration notes

**Files:**
- Create: `docs/superpowers/specs/2026-05-23-library-preset-project-design.md`
- Optional: `CHANGELOG.md`

- [x] **Step 1: Document compatibility promises**

Promises:

- Existing `profiles/*.json` continue to load.
- Existing `config.activeDir` continues to work.
- Existing `spells profiles` commands continue to work during transition.
- Existing project `.claude/skills` and `.codex/skills` symlinks are not force-rewritten unless `spells use` is run.

- [x] **Step 2: Document future cleanup candidates**

Candidate cleanup after the transition is stable:

- Rename `profiles/` to `presets/`
- Rename config `defaultProfile` to `defaultPreset`
- Rename `activeDir` to `cacheDir`
- Remove `projects/` as a primary classification directory after useful skills are globalized or moved to `liveos/` / `coding/`
- Hide or remove old `.txt` profile files if they are no longer used

Do not perform these cleanup steps in the first implementation pass.

---

## Phase 5: Verification

### Task 10: Full test suite

- [x] **Step 1: Type check**

```bash
npm run build
```

- [x] **Step 2: Test suite**

```bash
npm test
```

- [x] **Step 3: Manual smoke test against local fixture**

Use a temp HOME or fixture directory. Do not mutate the real iCloud skill library during automated tests.

Smoke flow:

```bash
spells skill list
spells preset list
spells use global-lite
spells status
spells status --verbose
```

Expected:

- Normal output uses Library / Preset / Project language.
- `active-skills` only appears in verbose/debug output.
- Existing profile JSON files still work.
- Existing config with `activeDir` still works.

---

## Rollout Strategy

1. Ship aliases and wording changes first.
2. Keep old command names and config fields working.
3. Hide active cache from normal output.
4. Update docs after CLI output is stable.
5. Only consider storage renames in a later major version.

## Non-goals

- Do not redesign the skill file format.
- Do not require immediate migration from `profiles/` to `presets/`.
- Do not remove `spells profiles` in this plan.
- Do not change iCloud folder layout unless a compatibility layer is already tested.
- Do not introduce a new database or package manager for skills.

## Success Criteria

- A new user can explain SyncSpells as: “Library has skills, Global is shared, Preset selects scenario skills, Project uses a preset.”
- A user can promote a cross-scenario skill with `spells skill globalize <skill>` and all references keep working.
- Daily commands do not mention Active Skills.
- Existing iCloud data remains usable without manual migration.
- Existing tests pass, with new tests covering preset aliases and simplified output.
