# 🧙‍♂️ sync-spells

[简体中文](./README.zh-CN.md)

Manage all your AI agent spells (commands, skills, agents) in one place and sync them to every tool via symlinks — write once, use everywhere.

## Features

- **Single source of truth** — maintain one spell directory instead of scattered configs
- **Symlink-based sync** — changes in your source directory are instantly reflected in all tools
- **Automatic backup** — existing directories are safely backed up before being replaced by symlinks
- **Supported tools**:
  - **Claude Code** — syncs `commands`, `skills`, and `agents`
  - **Cursor** — syncs `commands`
  - **Codex** — syncs `commands`
  - **Kiro** — syncs `commands`

## Installation

```bash
git clone https://github.com/samwangdd/sync-spells.git
cd sync-spells
npm install
npm run build
npm link
```

This registers the global `spells` command.

## Usage

### Setup

```bash
spells setup
```

Interactive prompt to specify your spell source directory and choose which tools to enable. Configuration is saved to `~/.sync-spells/config.json`.

### Sync spells

```bash
spells sync
```

Creates symlinks from your source directory into each tool's config directory. Existing real directories are backed up to `~/.sync-spells/backups/`.

### Push new spells

```bash
spells push [path]
```

Copies spell files from the specified directory (defaults to current directory) into your source directory. Existing files are skipped.

### Check status

```bash
spells status
```

Shows the active preset and linked skills for the current project. Use `spells status --verbose` to inspect global tool mapping symlinks.

## Skill Management

SyncSpells has four daily concepts:

1. **Library** - all available skills in `skills-registry/`.
2. **Global** - shared skills physically stored in `skills-registry/global/`.
3. **Preset** - a working mode that selects skills, such as `coding` or `lifeos`.
4. **Project** - the current repository using one preset.

Profiles still exist as the backward-compatible storage format for presets.

### Commands

- `spells skill list [--category]` - List Library skills
- `spells skill add <path>` - Add skill to the Library
- `spells skill new <name>` - Create a new skill
- `spells skill globalize <skill>` - Move a skill to `skills-registry/global/<name>` and update profile/preset references
- `spells preset [list|show]` - Manage presets
- `spells use <preset>` - Activate a preset in the current project
- `spells profiles [list|show]` - Backward-compatible profile commands
- `spells materialize <profile>` - Generate the internal skill cache from a profile
- `spells doctor` - Health check
- `spells config [get|set]` - Configuration management

### Quick Start

1. Review available skills:
   ```bash
   spells skill list
   ```

2. Review presets:
   ```bash
   spells preset list
   ```

3. Activate a preset in a project:
   ```bash
   cd /path/to/project
   spells use coding
   ```

4. Check status:
   ```bash
   spells status
   ```

### Global Skills

Use `globalize` when a skill should be shared by both LiveOS and Coding presets:

```bash
spells skill globalize <skill>
```

This physically moves the skill directory to `skills-registry/global/<name>` and updates every profile/preset JSON reference from the old Library path to the new `global/<name>` path. If a bare skill name matches multiple Library paths, rerun the command with the full Library path.

### Implementation Notes

`active-skills` is an internal generated cache used to materialize a preset before linking it into project tool directories such as `.codex/skills` and `.claude/skills`. It is kept compatible for existing configurations, but it is not part of the daily quickstart flow.

## Local Development

```bash
npm run dev          # Run via ts-node (no build needed)
npm run build        # Compile TypeScript → dist/
npm test             # Run all tests
```

Run a single test file:

```bash
npx jest __tests__/lib/symlink.test.ts
```

## License

MIT
