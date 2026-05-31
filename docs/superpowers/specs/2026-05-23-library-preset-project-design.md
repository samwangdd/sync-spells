# Library / Global / Preset / Project Design

Date: 2026-05-23

## Goal

Reduce SyncSpells skill management to a smaller daily model while keeping existing iCloud data and project links working.

The user-facing model is:

1. **Library**: all available skills in `skills-registry/`.
2. **Global**: shared skills physically stored in `skills-registry/global/`.
3. **Preset**: a working mode that selects skills, such as `coding` or `lifeos`.
4. **Project**: the current repository using one preset.

`Project` remains supported, but it is no longer the primary skill classification axis. Most day-to-day organization should happen through Global skills plus the LiveOS and Coding presets.

## Global Skills

`spells skill globalize <skill>` promotes a cross-scenario skill by moving its directory into the real Global location:

```text
skills-registry/global/<skill-name>/
```

After the move, the command updates profile/preset JSON references from the old Library-relative path to:

```text
global/<skill-name>
```

This keeps the physical structure aligned with the mental model: if a skill is globally available, it lives under `global/`.

## Presets

Presets are the preferred user-facing name for the existing profile mechanism.

Primary presets:

- `lifeos`: knowledge management, task management, and project-management workflows.
- `coding`: development workflows.

The existing `profiles/*.json` files remain the source of truth for now. A future migration may rename the directory to `presets/`, but that is intentionally out of scope for the first simplification pass.

## Compatibility Promises

- Existing `profiles/*.json` files continue to load.
- Existing `config.activeDir` continues to work.
- Existing `spells profiles` commands continue to work during the transition.
- Existing project `.claude/skills` and `.codex/skills` symlinks are not force-rewritten unless `spells use` is run.
- Existing Project support remains available, but Project is not the main way to classify skills.

## Implementation Notes

`active-skills` is an internal generated cache. It can still exist on disk and in config for compatibility, but normal commands and README quickstarts should describe Library, Global, Preset, and Project instead.

The Skills Market is only an install source. After installation, a market skill is just another Library skill and can be globalized if it should be shared across presets.

## Future Cleanup Candidates

These are not part of the first implementation pass:

- Rename `profiles/` to `presets/`.
- Rename config `defaultProfile` to `defaultPreset`.
- Rename `activeDir` to `cacheDir`.
- Remove `projects/` as a primary classification directory after useful skills are globalized or moved to `lifeos/` / `coding/`.
- Hide or remove old `.txt` profile files if they are no longer used.
