# Registry Categories and Project Resolve

> Status: Active
> Origin: SP-2, 2026-05-31

## Purpose

Skill Registry is the single source of truth for skill files. SP-2 settles the post-SP-1 model:

- Global skills are mounted by `spells sync` at the tool-global layer.
- Project skills are selected by a preset/profile, resolved from registry categories, and linked directly into the current project.
- `active-skills` and `materialize` are no longer part of the runtime path.

This document records the durable rules for the registry category layout, category profiles, project-level resolve, `use`, `migrate`, `globalize`, and `localize`.

## Registry Layout

The registry is the durable skill library. It has active categories plus an inactive parking area:

```text
skills-registry/
  global/
  knowledge/
  coding/
  workflow/
  inbox/
```

Categories:

- `global/`: always-on shared skills. These are linked globally by `spells sync`, not by project `use`.
- `knowledge/`: knowledge management, documentation, PARA/wiki, content transformation, and durable memory skills.
- `coding/`: technical implementation skills, including frontend, backend, Figma-to-code, performance, and project-specific engineering skills.
- `workflow/`: process skills such as task execution, worktree preparation, PR submission, QA handoff, Jira handling, and other repeatable operational flows.
- `inbox/`: unused, parked, experimental, or deprecated skills. It is part of the library, but not an active category.

Legacy empty containers such as `code/` and `root-files/` are not part of the model.

## Category Profiles

Profiles remain the storage format behind the user-facing preset concept. SP-2 adds category fields while keeping legacy `skills[]` readable:

```json
{
  "name": "coding",
  "extends": "base",
  "categories": ["coding"],
  "extras": ["workflow/lark-doc"]
}
```

Field rules:

- `name`: required profile name.
- `extends`: optional parent profile name. Resolve is recursive with cycle and depth guards.
- `categories`: active registry categories to expand. This is for project-facing categories, not `global` or `inbox`.
- `extras`: individual registry-relative skill paths added on top of categories.
- `skills`: legacy flat list. It is accepted for compatibility and filtered through the same project-level global exclusion rule.

Profiles should prefer `categories` when a preset wants most or all skills from a category. Use `extras` for cross-category exceptions or narrow additions.

## Resolve Semantics

Project-level resolve expands a profile into registry-relative skill paths:

```text
extends parent skills
  -> categories expanded from registry/<category>/*
  -> extras
  -> legacy skills[]
  -> filter global/* and inbox/*
  -> de-duplicate by skill basename, later entries win
```

The key rule is that project-level resolve excludes `global/*` and `inbox/*`.

Reason: `global/` is handled once by the global tool layer:

```text
spells sync -> tool global skills -> skills-registry/global/
```

Project activation is a separate layer:

```text
spells use [preset] -> project .claude/.codex skills -> skills-registry/<resolved project skill>
```

Including `global/*` in project resolve would duplicate the same skill in both layers and reintroduce unclear ownership. Including `inbox/*` would activate parked skills accidentally.

## Project Bindings

Project bindings map directory trees to preset/profile names. They are stored in CLI config as `projectBindings`:

```json
{
  "projectBindings": [
    { "path": "/Users/sammore/codeLab/MEXC", "profile": "mexc-code" },
    { "path": "/Users/sammore/codeLab", "profile": "coding" }
  ]
}
```

Bindings use longest path match. A worktree under a bound directory inherits the same preset without per-project configuration.

Resolution order:

1. Explicit preset passed to `spells use <preset>` or `spells resolve <preset>`.
2. Longest matching project binding for the current directory.
3. Legacy path inference fallback.
4. Default `global-lite`.

## Use Direct Links

`spells use [preset]` must not materialize an intermediate cache. The project path is:

```text
runUse
  -> ResolveService.resolve(<preset>)
  -> ProjectService.activateSkills(projectPath, preset, resolved.skills)
  -> project/.claude/skills/<skill> -> skills-registry/<category>/<skill>
  -> project/.codex/skills/<skill>  -> skills-registry/<category>/<skill>
```

The project state file stores the active preset/profile name in `.sync-spells.json`. It does not own skill contents.

## Migrate Rules

`spells migrate` is the one-time registry conversion command. It must:

1. Support `--dry-run` without changing files.
2. Create a backup beside the registry before real moves.
3. Move old registry paths into the current category layout.
4. Convert flat profile `skills[]` into category-aware profile data.
5. Remove `global/*` from project profile output.
6. Delete obsolete empty containers.
7. Report moves, converted profiles, and any manual review notes.

Default path mapping:

| Old path | New path |
| --- | --- |
| `global/*` | `global/*` |
| `domains/frontend/*`, `domains/figma/*` | `coding/*` |
| `domains/lark/*` | `workflow/*` |
| `projects/mexc/*` | `coding/*` |
| `projects/lifeos/task-*` | `workflow/*` |
| `projects/lifeos/llm-wiki*` | `knowledge/*` |
| `projects/omf/*` | `workflow/*` |
| `workflows/*` | `workflow/*` |
| `external/*` | `workflow/*` |
| `inbox/*` | unchanged inactive parked skill |

Profile conversion should preserve non-structural metadata, remove `skills[]`, and avoid writing `global/*` or `inbox/*` into active project output.

## Globalize Rules

`spells skill globalize <skill>` is for promoting a skill to always-on global scope.

It must:

- Resolve a full registry path or a unique skill basename.
- Move the skill directory to `skills-registry/global/<name>`.
- Fail if the target global skill already exists.
- Update profiles so old direct references are removed from project-level `skills[]` or `extras`.
- Avoid adding `global/<name>` back into project categories or extras.

Once globalized, the skill is supplied by `spells sync`, not by `spells use`.

## Localize Rules

`spells skill localize <skill> --to <category>` is for moving a global skill back into a local category.

Allowed local categories:

- `knowledge`
- `coding`
- `workflow`
- `inbox`

It must:

- Resolve a global skill by full path or unique basename.
- Move `skills-registry/global/<name>` to `skills-registry/<category>/<name>`.
- Fail if the target local skill already exists.
- Update profile references from `global/<name>` to `<category>/<name>`.

Use localize when a skill is useful to a specific preset or project class but should not be always-on. Use `--to inbox` to park a skill without making it available through project resolve.

## Invariants

- Registry is the only durable skill source.
- `active-skills` is not a runtime concept.
- Project `use` links directly to registry skill directories.
- Project resolve never includes `global/*` or `inbox/*`.
- Global skill availability is controlled by `spells sync`.
- Category profiles express project intent; they do not own global scope.
- Project bindings such as LifeOS, MEXC, and CodeLab map directory trees to presets; they are not registry categories themselves.
