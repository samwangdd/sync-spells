# SP-4 · Coding Cross-Repo Distribution Design

> Date: 2026-05-31
> Status: Draft
> Scope: Define how coding skills are distributed across repositories without reverting to project-level global auto-loading.

## Background

SP-1 split global and project skill layers:

- Global layer: `spells sync` links `skills-registry/global/` into enabled tools.
- Project layer: `spells use <preset>` links resolved project skills directly from registry categories.

SP-2 then made project resolve category-aware and explicitly excluded `global/*`.

SP-4 addresses a different need: coding skills often apply across many repositories. The solution must make those skills easy to distribute, but it must not reintroduce "all global skills are loaded into every project" through the project `use` path.

## Problem

Today, a repo receives coding skills only after a user runs `spells use <preset>` in that repo. This is correct but can be repetitive when multiple coding repositories share the same baseline.

The tempting shortcut is to make `coding/` behave like `global/` or to auto-load global into every project. That is rejected because it collapses scope boundaries:

- Global means always-on tool capability.
- Coding means project/repository working context.
- A project must be able to choose a coding preset intentionally.

## Goals

1. Define a cross-repo distribution boundary for `coding/` skills.
2. Keep `global/` excluded from project resolve.
3. Keep `coding/` project-scoped, not tool-global.
4. Support a repeatable way to apply a coding preset across repositories.
5. Prepare durable findings for `docs/02_Application/SyncSpells/skill-distribution-model.md`.

## Non-goals

- Do not make `coding/` part of `spells sync`.
- Do not make `global/*` appear in project `.claude/skills` or `.codex/skills`.
- Do not revive `active-skills` or `materialize`.
- Do not infer a coding preset from every repository without an explicit rule or state.

## Distribution Boundary

The boundary is:

```text
Tool-global capability:
  spells sync -> skills-registry/global/ -> tool global skills

Repo-local working context:
  spells use <preset> -> resolve preset -> project .claude/.codex skills
```

`coding/` belongs to repo-local working context. A coding skill may be reused across many repos, but each repo receives it through a preset activation, not through global sync.

## Candidate Commands

SP-4 may introduce one of these user flows:

### Option A: Explicit bulk apply

```bash
spells distribute coding --repos <repo-list>
```

Applies a chosen preset to multiple known repo paths by running the same project activation logic per repo.

Pros: explicit, auditable, no hidden inference.
Cons: needs repo list management.

### Option B: Repo marker plus use

```bash
spells use coding
```

Stores `.sync-spells.json` in each repo. Future `spells status` and `spells use` can reuse that state.

Pros: simple and already aligned with current model.
Cons: still one repo at a time.

### Option C: Preset inference rules

```json
{
  "inferenceRules": [
    { "pattern": "codeLab|frontend|api", "preset": "coding" }
  ]
}
```

ProjectService can infer a preset when no explicit preset is provided.

Pros: ergonomic.
Cons: must be visible and debuggable to avoid surprising repo activation.

## Preferred Direction

Start with explicit repo-local activation and make inference/status better before adding bulk mutation:

1. `spells use coding` remains the primitive.
2. `.sync-spells.json` records the active preset per repo.
3. `spells status --verbose` explains which preset was inferred or stored.
4. Optional bulk distribution can call the same `runUse` implementation for each repo.

No option may bypass `ResolveService`, and no option may include `global/*` in project links.

## Acceptance Criteria

- [ ] The implementation boundary says `coding/` is project-scoped, not global-sync scoped.
- [ ] Any bulk or inferred distribution path still calls `ResolveService` and `ProjectService.activateSkills`.
- [ ] Project activation still excludes `global/*`.
- [ ] `spells sync` remains limited to tool-global skills under `global/`.
- [ ] Status or dry-run output makes repo targets and presets visible before broad changes.
- [ ] Durable model notes are ready to merge into `docs/02_Application/SyncSpells/skill-distribution-model.md`.

