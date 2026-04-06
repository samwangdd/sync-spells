# sync-spells CLI Commands Design

## Overview

sync-spells is a CLI tool for unified management of AI agent spells (commands, skills, agents) across multiple AI tools (Claude Code, Cursor, Codex, Kiro). It uses a single source directory with symlink-based synchronization.

## Core Workflow

```
Scattered spell files                  Source directory                 Tool config directories
(~/.claude/commands/...)  --push-->  ~/spells-source/  --sync-->  ~/.claude/commands/ → (symlink)
                                   ├── commands/                ~/.cursor/commands/ → (symlink)
                                   ├── skills/                  ~/.codex/commands/ → (symlink)
                                   └── agents/                  ~/.kiro/commands/ → (symlink)
```

## Commands

### `spells setup`

Interactive initialization. Steps:

1. **Source directory**: Prompt user for path (default `~/spells`). Create if not exists.
2. **Select tools**: Checkbox with [Claude Code, Cursor, Codex, Kiro].
3. **Write config**: Save to `~/.sync-spells/config.json`.

Tool presets:

| Tool | configPath | mappings |
|------|-----------|----------|
| Claude Code | `~/.claude` | commands→commands, skills→skills, agents→agents |
| Cursor | `~/.cursor` | commands→commands |
| Codex | `~/.codex` | commands→commands |
| Kiro | `~/.kiro` | commands→commands |

### `spells push [path]`

Collect scattered spell files into the source directory.

- No argument: scan current directory for commands/skills/agents subdirectories.
- With path: scan specified directory (e.g. `spells push ~/.claude`).
- Copies files to `source/{subdir}/`.
- **Skip** if file already exists in source (log warning).
- Output summary: N copied, M skipped.

### `spells sync`

Create symlinks from source to each enabled tool's config directory.

For each mapping in each enabled tool:
1. Compute source path: `source/{from}`
2. Compute target path: `{tool.configPath}/{to}`
3. Check state via `checkSymlinkState()`:
   - `missing` → create symlink
   - `linked` → skip
   - `real-dir` → backup via `backupPath()`, then create symlink
   - `broken` / `wrong-target` → remove old symlink, create new one
4. Output each mapping's result.

### `spells status`

Show sync state for all tool mappings.

1. Read config.
2. For each tool's mappings, check symlink state.
3. Display as a table.

## Architecture

**Pattern**: Command-as-function (方案 A)

Each command module exports a `register*` function that registers a Commander subcommand. Business logic lives within the module, calling existing lib/ utilities.

```
src/
├── index.ts              # Entry point, registers all commands
├── commands/
│   ├── setup.ts          # spells setup
│   ├── push.ts           # spells push [path]
│   ├── sync.ts           # spells sync
│   └── status.ts         # spells status
└── lib/
    ├── config.ts         # (existing)
    ├── symlink.ts        # (existing)
    └── backup.ts         # (existing)
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No config (setup not run) | Print "Run `spells setup` first" and exit |
| Source directory missing | Print error, suggest running setup |
| Target is symlink with wrong target | Remove old symlink, create new |
| Push: file exists in source | Skip, log warning |
| Backup fails during sync | Abort, prompt manual resolution |

## Testing

| Command | Key test points |
|---------|----------------|
| setup | Mock inquirer, verify config written correctly |
| push | Mock fs, verify copy and skip logic |
| sync | Test all symlinkState branches |
| status | Verify output format |

## Config Schema (existing)

```typescript
interface Config {
  source: string;  // absolute path to source directory
  tools: Record<string, ToolConfig>;
}

interface ToolConfig {
  enabled: boolean;
  configPath: string;  // e.g. "~/.claude"
  mappings: ToolMapping[];
}

interface ToolMapping {
  from: string;  // subdirectory name in source
  to: string;    // subdirectory name in tool config
}
```
