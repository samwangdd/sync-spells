# Global-Profile Sync Design

Date: 2026-06-02

## Goal

Make `spells sync` distribute global skills from the **`global` profile** instead of a physical `global/` directory. Under the current model "Global" is a profile (`profiles/global.json`, an `extras` list of skills), not a physical `skill-category/global/` directory — which no longer exists. The tool mappings still carry `{ from: 'global', to: 'skills' }`, so global skill sync is currently a no-op (the source `<source>/global` is absent) and the deployed symlinks have drifted (`~/.agents/skills` and `~/.cursor/skills` are hand-made chains into `~/.claude/skills`).

This closes that gap: `from: 'global'` becomes a reserved value meaning "resolve the `global` profile and merge its skills here."

## Scope

In scope:
- Reinterpret tool mappings with `from === 'global'` in `runSync` as a global-profile merge.
- Per-skill, own-only symlink merge into each enabled tool's target dir.

Out of scope:
- The agents sync pass (separate), `spells use` project-level linking (unchanged), MCP sync (separate).
- Any config schema change — the existing `{ from, to }` mapping shape is reused.
- Per-preset global sets — only the single `global` profile drives global sync.

## Behavior

For each enabled tool, for each mapping:
- **`from !== 'global'`** — unchanged legacy behavior: symlink `<source>/<from>` → `<toolBase>/<to>` via the existing 4-state symlink machine.
- **`from === 'global'`** — resolve the `global` profile and merge its skills as per-skill symlinks into `<toolBase>/<to>`.

`'global'` is a reserved `from` value; it does not refer to a physical directory.

## Resolving the global skill set

Use `ResolveService.resolve('global')` → `skills: string[]`, where each entry is a category-relative path such as `foundation/skill-creator` (sourced from `profiles/global.json` `extras`). `ResolveService` is constructed the same way other commands build it (with `ProfileService` and `SkillService` over `config`).

- If the `global` profile does not exist, `ResolveService.resolve` throws; surface a clear error (`global profile not found`).

Each resolved skill maps to a source path: `sourcePath = path.join(expandHome(config.source), skillPath)`.

## Per-tool merge (own-only)

Target dir: `targetDir = path.join(expandHome(toolConfig.configPath), mapping.to)`.

**Prepare the target dir:**
- If `targetDir` is a symlink (e.g. the `~/.agents/skills → ~/.claude/skills` chain): `backupPath(targetDir)`, remove the symlink, then `mkdir` a real directory.
- If `targetDir` is missing: `mkdir -p`.
- If `targetDir` is a real directory: use as-is (no backup — the merge only touches owned links).

**Ownership rule:** an entry in `targetDir` is *sync-spells-owned* iff it is a symlink whose resolved target (`path.resolve` of its `readlink`) is inside `expandHome(config.source)`. Real files and symlinks pointing outside `config.source` are *foreign* and are never modified or removed.

**Merge actions** (per tool):
- For each resolved global skill `skillName` → ensure `targetDir/<skillName>` is a symlink to `sourcePath`:
  - missing → create symlink (`linked`)
  - owned symlink with wrong target → re-point (`updated`)
  - already correct → `skipped`
  - a *foreign* entry occupies `targetDir/<skillName>` → report `error` (name collision with a non-owned entry; do not overwrite)
  - `sourcePath` does not exist → report `error` for that skill, continue with the rest
- **Prune:** for each *owned* symlink in `targetDir` whose basename is not in the resolved set → remove it (`pruned`). This converges the owned links to exactly the `global` profile's set.

Foreign entries are left untouched throughout.

## Result reporting

`runSync` returns, in addition to the existing skill-mapping results, a list of global-skill results — one per `(tool, skill)` with `action ∈ linked | updated | skipped | pruned | error`, plus a per-tool note when a chain symlink was converted (`backed-up`). The `sync` command prints these under a `Global skills:` section, mirroring the existing summary style.

## Structure

- The global-merge logic is a focused unit (a `runGlobalMerge(config, toolKey, toolConfig, mapping)` helper, or an exported `mergeGlobalSkills`), called from `runSync`'s tool loop when `mapping.from === 'global'`. Keeping it a separate function preserves `runSync`'s readability and lets it be tested directly.
- Reuse `ResolveService` (resolve the global profile), `lib/symlink` (`checkSymlinkState`), `lib/backup` (`backupPath`).
- Ownership check helper: `isOwnedLink(linkPath, sourceRoot)` — true when `lstat` is a symlink and `path.resolve(dirname(linkPath), readlink(linkPath))` starts with `sourceRoot`.

## Error handling

- Missing `global` profile → throw a clear error from the global pass (sync fails with an actionable message).
- A resolved skill whose `sourcePath` is absent → `error` result for that skill; the rest still sync.
- A foreign entry colliding with a desired skill name → `error` result; never overwrite foreign content.
- Idempotent: a second run yields all `skipped` with no filesystem changes.

## Testing (TDD)

1. Resolve `global` and merge → each profile skill becomes a symlink in the tool target dir pointing at the correct source path.
2. Own-only: a pre-existing foreign file and a foreign symlink (pointing outside `config.source`) in the target dir are preserved untouched.
3. Prune: an owned symlink (into `config.source`) whose skill is not in the global set is removed.
4. Chain conversion: a target dir that is itself a symlink is backed up and replaced by a real directory containing the merged links.
5. Idempotency: a second `runGlobalMerge` run reports all `skipped`, no changes.
6. Missing `global` profile → throws a clear error.
7. Collision: a foreign real file at `<targetDir>/<skillName>` yields an `error` result and is not overwritten.

## Compatibility

- Config schema unchanged; existing `{ from: 'global', to: 'skills' }` mappings are honored with the new meaning.
- Non-`global` mappings keep the legacy dir→dir symlink behavior.
- Existing foreign content in `~/.claude/skills` (real skill dirs, user files) is preserved — only sync-spells-owned global links are managed and pruned.
