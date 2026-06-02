# 🧙‍♂️ sync-spells

[简体中文](./README.zh-CN.md)

Manage all your AI agent spells (commands, skills, agents) in one place and sync them to every tool via symlinks — write once, use everywhere.

## Features

- **Single source of truth** — maintain one spell directory instead of scattered configs
- **Symlink-based sync** — changes in your source directory are instantly reflected in all tools
- **Automatic backup** — existing directories are safely backed up before being replaced by symlinks
- **Cross-tool agents** — one canonical agent `.md` is adapted per tool: `.md` symlink (Claude Code / Cursor), generated `.toml` (Codex), generated `.json` (Kiro)
- **Supported tools**:
  - **Claude Code**, **Agents**, **Codex**, **Cursor**, and **Kiro** — sync global `skills`

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

`spells sync` also runs an **agents pass**. Agent definitions are authored once as canonical Markdown in `agents/{global,coding,system}/*.md` (YAML frontmatter + body) and adapted to each enabled tool:

| Tool | Target | How |
|------|--------|-----|
| Claude Code | `~/.claude/agents/<name>.md` | symlink (passthrough) |
| Cursor | `~/.cursor/agents/<name>.md` | symlink (passthrough) |
| Codex | `~/.codex/agents/<name>.toml` | generated from frontmatter + body |
| Kiro | `~/.kiro/agents/<name>.json` | generated from frontmatter + body |

Generated files are derived output — edit the canonical `.md`, never the `.toml`/`.json`. Pre-existing real files are backed up before being replaced.

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

SyncSpells has five daily concepts:

1. **Library** - all available skills in `skill-category/`.
2. **Global profile** - the minimal always-available set in `profiles/global.json`.
3. **Preset** - a working mode that selects skills, such as `coding` or `lifeos`.
4. **Binding** - a directory tree mapped to a default preset.
5. **Project** - the current repository using one preset.

Profiles still exist as the backward-compatible storage format for presets.

### Commands

- `spells skill list [--category]` - List Library skills
- `spells skill add <path>` - Add skill to the Library
- `spells skill new <name>` - Create a new skill
- `profiles/global.json` - Add a skill to the minimal global profile with an explicit `extras` entry
- `spells skill localize <skill> --to <category>` - Move a global skill back to `knowledge`, `coding`, `workflow`, or `inbox`
- `spells bind [list|add|remove]` - Manage directory-tree defaults for presets
- `spells preset [list|show]` - Manage presets
- `spells use [preset]` - Activate a preset in the current project
- `spells resolve [preset]` - Inspect the project skill list a preset resolves to
- `spells migrate [--dry-run]` - Convert an existing registry to the category layout
- `spells profiles [list|show]` - Backward-compatible profile commands
- `spells doctor` - Health check
- `spells workspace [init|doctor|migrate]` - Manage the workspace manifest and validate skill/agent symlink health
- `spells config [get|set]` - Configuration management

## MCP Management

MCP configuration is managed separately from skills. Put shared MCP servers in `mcp-registry/global.json` and project presets in `mcp-registry/presets/<preset>.json`.

```bash
spells mcp status
spells mcp sync --global --dry-run
spells mcp sync --global
spells mcp use coding --dry-run
spells mcp use coding
```

Global MCP sync merges only sync-spells-owned server entries into Claude Code, Cursor, and Codex target files. Existing user-owned settings are preserved and same-name conflicts are refused unless explicitly adopted.

## Workspace

The iCloud `sync-spells/` directory is a managed **workspace**. A `workspace.json` manifest at its root declares the directories the CLI owns:

```json
{ "version": 1, "library": "skill-category", "profiles": "profiles", "agents": "agents", "legacy": [] }
```

```bash
spells workspace init      # Write workspace.json (idempotent)
spells workspace doctor    # Validate manifest dirs + tool symlink health
spells workspace migrate   # Create any missing manifest-declared directories
```

`workspace doctor` reports a problem when a manifest directory is missing, when a tool's skill-mapping symlink is broken or points at the wrong target, or when a Claude Code / Cursor agent passthrough symlink is dangling — surfacing sync drift before it bites. Run `spells sync` to repair.

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
   spells use
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

Use `profiles/global.json` for skills that should be available in the smallest fallback profile. Add entries one by one under `extras`; do not import an entire category into the global profile.

Use `localize` when a global skill should move back into a scoped category:

```bash
spells skill localize <skill> --to knowledge
spells skill localize <skill> --to coding
spells skill localize <skill> --to workflow
spells skill localize <skill> --to inbox
```

### Implementation Notes

`spells use [preset]` resolves the explicit preset or the current directory's longest matching binding, then links project skills directly from the skill category into `.codex/skills` and `.claude/skills`. Inbox skills are intentionally excluded from project-level links.

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
