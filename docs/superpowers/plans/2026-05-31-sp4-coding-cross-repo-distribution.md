# SP-4 Coding Cross-Repo Distribution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Make coding skill reuse across repositories explicit and repeatable without turning `coding/` or `global/` into project auto-load.

**Spec:** `docs/superpowers/specs/2026-05-31-sp4-coding-cross-repo-distribution-design.md`

## Task 1: Audit current activation paths

**Files:** `src/commands/use.ts`, `src/services/ProjectService.ts`, `src/services/ResolveService.ts`, `src/commands/status.ts`, tests.

- [ ] Trace `runUse -> ResolveService.resolve -> ProjectService.activateSkills`.
- [ ] Confirm `global/*` is excluded before project linking.
- [ ] Confirm `spells sync` only handles global tool-level mappings.
- [ ] Record any places where inference silently chooses `global-lite`.

## Task 2: Decide initial distribution UX

- [ ] Compare explicit bulk apply, repo marker reuse, and inference rules.
- [ ] Choose the smallest implementation that keeps repo targets visible.
- [ ] Define dry-run output before any command mutates multiple repos.
- [ ] State that all paths reuse existing project activation code.

## Task 3: Improve status and inference visibility

**Files:** `src/commands/status.ts`, `src/services/ProjectService.ts`, tests.

- [ ] Show active preset from `.sync-spells.json`.
- [ ] If a preset is inferred, show the matched rule in verbose output.
- [ ] Avoid implying global skills are project-linked.
- [ ] Add tests for stored preset vs inferred preset output.

## Task 4: Optional bulk distribution command

**Files:** new command only if Task 2 selects bulk distribution.

- [ ] Add a dry-run mode that lists target repos and preset.
- [ ] For real execution, call `runUse(config, repoPath, preset)` per repo.
- [ ] Fail individual repos without aborting the whole batch unless the failure is configuration-wide.
- [ ] Never link `global/*` into project skill dirs.

## Task 5: Verification

- [ ] `npm run build`
- [ ] `npm test`
- [ ] Run a temp repo activation for a coding preset and inspect `.claude/skills` / `.codex/skills`.
- [ ] Confirm no project link target contains `/global/` unless a test intentionally covers legacy compatibility behavior.

## Task 6: Durable docs follow-up

- [ ] Create or update `docs/02_Application/SyncSpells/skill-distribution-model.md`.
- [ ] Move durable SP-4 decisions into that module doc after implementation.
- [ ] Keep this spec/plan as execution records until that archive is complete.

