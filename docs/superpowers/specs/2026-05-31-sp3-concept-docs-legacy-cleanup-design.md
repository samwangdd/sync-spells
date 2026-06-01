# SP-3 · Concept Docs and Legacy Cleanup Design

> Date: 2026-05-31
> Status: Draft
> Scope: Simplify user-facing concepts and remove legacy bash/materialize/active-skills remnants after SP-1 and SP-2.

## Background

SP-1 established registry as the single source of truth and removed the project-level `active-skills` hop. SP-2 added the 4+2 registry model, category profiles, `resolve`, `migrate`, and `use` via direct registry links.

The remaining problem is conceptual drift:

- README still exposes `materialize` and describes `active-skills` as an internal cache.
- CLI copy still mixes old registry/profile language with the newer Library/Global/Preset/Project model.
- Legacy bash artifacts are still present or referenced.
- Old docs and examples can make future work accidentally rebuild `active-skills`.

SP-3 cleans the public story and removes legacy residues without changing the resolved runtime model.

## Goals

1. Reduce public concepts to Library, Global, Preset, and Project.
2. Update README and CLI UX so `resolve`, `migrate`, `use`, and `globalize` are explained in the post-SP-2 model.
3. Remove legacy bash/materialize/active-skills artifacts and references.
4. Preserve compatibility for existing profile files where the code still supports them.
5. Prepare durable findings for `docs/02_Application/SyncSpells/skill-management-model.md`.

## Non-goals

- Do not change registry layout beyond the SP-2 4+2 model.
- Do not make `global` auto-loaded by project `use`.
- Do not implement coding cross-repo distribution; that is SP-4.
- Do not delete compatibility reads for legacy profile shape unless tests prove it is safe.

## Concept Model

Daily concepts:

- Library: all skills under `skills-registry/`.
- Global: always-on skills physically stored in `skills-registry/global/` and linked by `spells sync`.
- Preset: a named working mode stored as a profile JSON.
- Project: the current repository, activated with `spells use <preset>`.

Internal concepts:

- Profile JSON remains the storage format for presets.
- Resolve expands preset/profile data into project skill links.
- Migrate is an administrative conversion tool, not a daily command.

Removed concepts:

- `active-skills`
- `materialize`
- legacy bash setup as the primary workflow
- old generated cache mental model

## README and UX Rules

README should:

- Present the four daily concepts near the top of Skill Management.
- Show `spells use <preset>` as the project activation path.
- Explain `spells resolve <preset>` as an inspection/debug command.
- Explain `spells migrate --dry-run` as an admin migration command.
- Explain `spells skill globalize <skill>` as a promotion to global sync scope.
- Remove `spells materialize` from daily command lists.
- Avoid saying project skills are generated into a cache.

CLI help should:

- Prefer "preset" in user-facing command descriptions.
- Use "profile" only when referring to backward-compatible storage or explicit `profiles` commands.
- Not mention `active-skills` in normal help or status output.
- Keep `profiles` commands marked as compatibility commands if they remain.

## Legacy Cleanup Scope

Remove or retire:

- `scripts/migrate-from-bash.sh` if no tests or docs require it.
- `setup.sh` references and any legacy bash setup guidance.
- `sync-spells.json` examples if they represent the pre-Node or pre-SP-1 config model.
- `active-skills` references in README, docs, tests, status output, and migration prose unless the reference is explicitly historical.
- `materialize` command registration, command docs, tests, and source files if still present.

Historical docs under `docs/superpowers/specs` and old plans may keep references when they are clearly dated design history. Current user-facing docs should not.

## Acceptance Criteria

- [ ] README and README.zh-CN describe Library, Global, Preset, Project with no active-skills daily flow.
- [ ] README command list includes `resolve` and `migrate`, and excludes `materialize`.
- [ ] CLI help/descriptions no longer advertise materialize or active-skills.
- [ ] Legacy bash/materialize/active-skills residues are deleted or explicitly isolated as historical docs.
- [ ] Tests/build pass after cleanup.
- [ ] Durable model notes are ready to merge into `docs/02_Application/SyncSpells/skill-management-model.md`.

