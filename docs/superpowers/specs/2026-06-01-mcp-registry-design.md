# MCP Registry Design

> Status: Proposed
> Origin: MCP configuration discussion, 2026-06-01

## Goal

Add MCP configuration management to sync-spells as a capability parallel to skills, not as part of `skills-registry`.

The feature should support:

- global MCP servers shared across tools;
- project and preset-specific MCP servers, such as `coding` and `lifeos`;
- Claude Code, Cursor, and Codex target formats;
- safe global writes without replacing user-owned config;
- worktree-friendly project activation.

## Registry Layout

MCP configuration lives beside the skill registry:

```text
<source>/
  skills-registry/
  mcp-registry/
    global.json
    presets/
      coding.json
      lifeos.json
```

`skills-registry/` remains the source of skills only. `mcp-registry/` is the source of MCP server definitions only.

The source format is JSON and intentionally close to Claude Code and Cursor MCP shape:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

The registry stores logical MCP server definitions. Tool-specific renderers translate those definitions into each target file.

## Target Files

sync-spells writes different target formats per tool:

| Tool | Global target | Project target |
| --- | --- | --- |
| Claude Code | `~/.claude.json` | `.mcp.json` |
| Cursor | `~/.cursor/mcp.json` | `.cursor/mcp.json` |
| Codex | `~/.codex/config.toml` | `.codex/config.toml` |

Claude Code and Cursor can consume JSON-shaped MCP definitions. Codex requires TOML under `[mcp_servers.<name>]`.

## Ownership Model

Global target files are shared with user and tool-owned settings. sync-spells must not replace entire files.

sync-spells owns only MCP entries recorded in a local manifest:

```text
~/.sync-spells/mcp-manifest.json
```

The manifest records the generated target entries:

```json
{
  "targets": {
    "claude-code:global": ["context7"],
    "cursor:global": ["context7"],
    "codex:global": ["context7"]
  }
}
```

During sync:

- entries present in the manifest may be updated or removed by sync-spells;
- entries not present in the manifest are user-owned and must be preserved;
- if sync-spells wants to create an entry whose name already exists but is not in the manifest, the operation reports a conflict and does not overwrite it;
- `--force-adopt` may explicitly adopt an existing entry into the manifest after showing the diff.

This avoids polluting server names with a `syncspells.` prefix while still preserving a clear ownership boundary.

## Global Sync

`spells mcp sync --global` reads `mcp-registry/global.json` and merges it into enabled tool global targets.

The command must:

- parse existing target files and preserve unrelated content;
- create target files when they do not exist;
- update only manifest-owned server entries;
- refuse conflicting non-owned server names by default;
- keep a timestamped backup before writing;
- support `--dry-run` to show additions, updates, removals, and conflicts without writing.

Global MCP sync is separate from `spells sync` initially. This keeps skill symlink sync and MCP config mutation operationally distinct.

## Project Activation

`spells mcp use [preset]` activates project MCP config in the current repository.

Preset resolution follows the existing project model:

```text
explicit preset
  -> longest path binding
  -> current active preset in .sync-spells.json
  -> default fallback
```

For a preset such as `coding`, sync-spells reads:

```text
mcp-registry/global.json
mcp-registry/presets/coding.json
```

Project output is written into the current repository:

```text
.mcp.json
.cursor/mcp.json
.codex/config.toml
```

Project target files may be generated as sync-spells-owned files, but the safer default is still merge/upsert by MCP server name. This allows a repository to keep manually maintained MCP entries.

The active MCP preset is recorded in `.sync-spells.json`:

```json
{
  "activePreset": "coding",
  "activeMcpPreset": "coding"
}
```

## Worktree Support

Worktrees inherit presets through the existing longest-path binding behavior. A worktree under `/Users/sammore/codeLab` can resolve to `coding` without extra setup.

Project MCP config is generated into each worktree root. This keeps paths, trust prompts, and tool-local project files scoped to the actual working directory.

Worktree-specific differences should use environment variables or preset overrides:

```json
{
  "mcpServers": {
    "local-dev": {
      "command": "node",
      "args": ["${WORKTREE_ROOT}/scripts/mcp-server.js"],
      "env": {
        "PORT": "${WORKTREE_MCP_PORT}"
      }
    }
  }
}
```

sync-spells should preserve variable references during rendering. It should not resolve secrets or machine-local values into generated files.

## Commands

Initial command surface:

```bash
spells mcp status
spells mcp status --verbose
spells mcp sync --global
spells mcp sync --global --dry-run
spells mcp use [preset]
spells mcp use [preset] --dry-run
```

`status` reports:

- available MCP registry files;
- enabled tools;
- active project MCP preset;
- inferred preset and matched binding;
- target file presence;
- managed entries, unmanaged entries, and conflicts.

## Error Handling

Invalid source JSON fails before any target write.

Unsupported server shapes fail with a clear message naming the server and field. The first supported shape should cover `command`, `args`, `env`, `url`, and `headers`, because those map cleanly across the target tools.

Target parse failures stop writes for that target and leave other targets untouched.

Conflicts are not fatal for status or dry-run. They are fatal for write commands unless the user explicitly adopts or renames the entry.

## Testing

Unit tests should cover:

- registry loading and validation;
- JSON target merge for Claude Code and Cursor;
- TOML target merge for Codex;
- manifest ownership decisions;
- conflict detection;
- project preset inference and worktree path binding;
- dry-run output data.

Integration tests should exercise:

- global dry-run with existing unmanaged entries;
- project activation into a temp repo;
- repeated activation idempotence;
- conflict refusal and explicit adopt behavior.

## Non-Goals

This design does not add an MCP server installer. Registry entries assume server commands or URLs are already valid.

This design does not make `.mcp.json` a universal target format. It is only one target format and a convenient source shape.

This design does not merge secrets into config files. Secrets should stay in environment variables or external secret stores.
