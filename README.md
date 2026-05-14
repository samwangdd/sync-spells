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

Shows the symlink status of every mapping for each tool.

## Profile System

SyncSpells supports Profile-based skill management. Profiles define which skills to activate for different projects.

### Commands

- `spells profiles [list|show]` - Manage profiles
- `spells use [--profile <name>]` - Activate profile in current project
- `spells materialize <profile>` - Generate active skills from profile
- `spells skill add <path>` - Add skill to registry
- `spells skill new <name>` - Create new skill
- `spells skill list [--category]` - List registry skills
- `spells doctor` - Health check
- `spells config [get|set]` - Configuration management

### Quick Start

1. Initialize:
   ```bash
   spells setup
   ```

2. Use in project:
   ```bash
   cd /path/to/project
   spells use
   ```

3. Check health:
   ```bash
   spells doctor
   ```

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