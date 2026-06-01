# Skill Distribution Model

> Status: Active
> Origin: SP-4, 2026-05-31

## Boundary

Skill distribution has two layers:

```text
Tool-global capability:
  spells sync -> skills-registry/global/ -> enabled tool skills

Repo-local working context:
  spells use [preset] -> explicit preset or project binding -> resolved project skills -> repo .claude/.codex skills
```

`coding/` skills are reusable across repositories, but they remain repo-local working context. They are not distributed by `spells sync`.

The local category set is:

- `knowledge`
- `coding`
- `workflow`

Project names such as LifeOS and MEXC are presets over these categories, not registry categories.
`inbox/` is allowed inside the registry as an inactive parking area, but it is not a local category for project distribution.

## Coding Skill Reuse

The primitive for coding skill distribution is still:

```bash
spells use coding
```

Run it in each repository that should receive the coding preset, or bind a parent directory once:

```bash
spells bind add /Users/sammore/codeLab --profile coding
spells bind add /Users/sammore/codeLab/MEXC --profile mexc-code
```

Bindings use longest path match, so worktrees under a bound directory inherit the same preset. The active preset is stored in that repository's `.sync-spells.json` after activation.

Bulk distribution may be added later, but it must call the same project activation path per repository:

```text
runUse(config, repoPath, preset)
  -> ResolveService.resolve(preset)
  -> ProjectService.activateSkills(repoPath, preset, resolved.skills)
```

No distribution path may bypass `ResolveService`.

## Status and Inference

`spells status` shows the active project preset when `.sync-spells.json` exists.

`spells status --verbose` also shows:

- whether the project preset came from `activePreset` or legacy `activeProfile`;
- the inferred preset and matched binding or fallback inference rule when no preset is active;
- global tool mapping symlink status.

Inference is diagnostic until the user runs `spells use [preset]`. It must not silently mutate a repository.

## Invariants

- `global/` stays tool-global, not project-linked.
- `inbox/` stays inactive, not project-linked.
- `knowledge/`, `coding/`, and `workflow/` stay project-scoped.
- `coding/` stays project-scoped, not global-sync scoped.
- Project activation excludes `global/*` and `inbox/*`.
- Cross-repo reuse must keep target repositories and presets visible before broad mutation.
- The stored per-repo preset in `.sync-spells.json` is the durable project state.
