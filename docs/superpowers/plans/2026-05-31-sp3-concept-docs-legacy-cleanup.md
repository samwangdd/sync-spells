# SP-3 Concept Docs and Legacy Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Make the post-SP-2 model the only user-facing model: Library, Global, Preset, Project. Update README/UX and remove legacy bash/materialize/active-skills residue.

**Spec:** `docs/superpowers/specs/2026-05-31-sp3-concept-docs-legacy-cleanup-design.md`

## Task 1: Inventory legacy references

**Files:** README files, `src/commands/*`, `src/index.ts`, tests, scripts, docs.

- [ ] Run `rg -n "active-skills|materialize|setup.sh|migrate-from-bash|sync-spells.json|legacy-commands" README* src __tests__ scripts docs`.
- [ ] Classify each hit as user-facing current doc, current code/test, or historical dated doc.
- [ ] Keep dated historical docs only when they remain clearly archival.

## Task 2: README concept rewrite

**Files:** `README.md`, `README.zh-CN.md`

- [ ] Rewrite Skill Management around Library, Global, Preset, Project.
- [ ] Add `spells resolve <preset>` and `spells migrate [--dry-run]`.
- [ ] Remove `spells materialize <profile>` from command lists.
- [ ] Replace active-skills implementation notes with direct registry link notes.
- [ ] Keep compatibility wording for `profiles` commands.

## Task 3: CLI UX cleanup

**Files:** `src/index.ts`, `src/commands/*.ts`, command tests.

- [ ] Remove or hide materialize command registration if present.
- [ ] Update command descriptions to say preset for daily usage.
- [ ] Ensure status output does not mention `active-skills`.
- [ ] Keep `profiles` command wording backward-compatible.
- [ ] Update tests for changed output.

## Task 4: Delete legacy bash residues

**Files:** `scripts/migrate-from-bash.sh`, root legacy setup/config artifacts if present.

- [ ] Confirm no current command depends on legacy bash scripts.
- [ ] Delete unused legacy scripts.
- [ ] Remove README references to bash setup.
- [ ] Keep package scripts only if they are current Node/TypeScript workflows.

## Task 5: Verification

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `rg -n "active-skills|materialize|setup.sh|migrate-from-bash|legacy-commands" README* src __tests__ scripts` returns no current-model residue.

## Task 6: Durable docs follow-up

- [ ] Create or update `docs/02_Application/SyncSpells/skill-management-model.md`.
- [ ] Move durable decisions from the SP-3 spec into that module doc.
- [ ] Keep the SP-3 spec/plan as temporary execution records until that archive is complete.

