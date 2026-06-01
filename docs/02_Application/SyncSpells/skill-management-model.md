# Skill Management Model

> Status: Active
> Origin: SP-3, 2026-05-31

## Daily Concepts

SyncSpells uses five user-facing concepts:

- Library: all skills available in `skills-registry/`.
- Global: always-on shared skills stored in `skills-registry/global/`.
- Preset: a named working mode, stored as a profile JSON for compatibility.
- Binding: a directory tree mapped to a default preset.
- Project: the current repository, activated with `spells use [preset]`.

The word `profile` remains valid for the storage format and compatibility commands. Daily UX should prefer `preset`.

## Runtime Model

Global and project skills are different layers:

```text
Global layer:
  spells sync
    -> skills-registry/global/
    -> tool global skills directory

Project layer:
  spells use [preset]
    -> explicit preset or project binding
    -> ResolveService.resolve(<preset>)
    -> ProjectService.activateSkills(...)
    -> project .claude/.codex skills
```

Project activation links directly to registry skill directories. It does not generate an intermediate cache.

## Command Roles

- `spells skill list [--category]`: browse Library skills.
- `spells skill globalize <skill>`: promote a skill to Global scope.
- `spells skill localize <skill> --to <category>`: move a Global skill back to `knowledge`, `coding`, or `workflow`.
- `spells preset list|show|validate`: work with user-facing presets.
- `spells profiles list|show`: compatibility access to profile JSON storage.
- `spells bind list|add|remove`: manage directory-tree defaults for presets.
- `spells resolve [preset]`: inspect project-level skill resolution.
- `spells use [preset]`: activate project skills for the current repository.
- `spells migrate [--dry-run]`: administrative registry conversion to the current category model.
- `spells status [--verbose]`: inspect project activation and global tool mappings.

## Removed Concepts

The current model does not expose generated project caches or materialization as a daily concept.

Historical design docs may mention earlier cache-based flows. Current README, CLI help, and operational docs should describe direct registry linking instead.

## UX Rules

- Say "preset" in daily command descriptions.
- Say "profile" only for compatibility commands or JSON storage.
- Explain Global as tool-level availability via `spells sync`.
- Explain Project activation as repo-local availability via `spells use`.
- Explain Binding as the default preset for a directory tree, with longest path match.
- Do not imply that Global skills are copied into project skill directories.

## Category Model

Registry categories are:

- `global`: always-on skills for every tool context.
- `knowledge`: knowledge management, docs, wiki, PARA, and content workflows.
- `coding`: code, repository, debugging, and engineering workflows.
- `workflow`: repeatable operational processes that are not intrinsically code or knowledge.
- `inbox`: parked or deprecated skills; not expanded by project resolve.

Projects are not categories. LifeOS, MEXC, and CodeLab should be bindings to presets that combine categories:

- LifeOS can combine `knowledge` and `workflow`.
- MEXC development projects can primarily use `coding`, with workflow extras when needed.
- CodeLab can default to `coding` for repository work.
