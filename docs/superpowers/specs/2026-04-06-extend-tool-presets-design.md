# Extend Tool Preset Mappings (Approach A)

Date: 2026-04-06

## Goal

Update tool presets to accurately reflect each tool's supported directory structure, so `spells sync` creates correct symlinks for skills, commands, and agents across Claude Code, Cursor, Codex, and Kiro.

## Research Findings

| Tool | Commands | Skills | Agents |
|------|----------|--------|--------|
| Claude Code | `commands/` | `skills/` | `agents/` |
| Cursor | `commands/` (deprecated) | `skills/` | Not supported |
| Codex | Not supported | `~/.agents/skills/` (outside configPath) | `agents/` |
| Kiro | `prompts/` (different name) | `skills/` | `agents/` |

## Design Decision

Use existing `from/to` mapping mechanism — no architecture changes. Each tool's preset accurately declares what directories it supports.

## Mapping Changes

### Cursor: add `skills`
```typescript
mappings: [
  { from: 'commands', to: 'commands' },
  { from: 'skills', to: 'skills' },
]
```

### Codex: fix mappings
Remove incorrect `commands` mapping. Add `agents`. Skip `skills` (path is outside configPath).
```typescript
mappings: [
  { from: 'agents', to: 'agents' },
]
```

### Kiro: rename and expand
Rename `commands` target to `prompts`. Add `skills` and `agents`.
```typescript
mappings: [
  { from: 'commands', to: 'prompts' },
  { from: 'skills', to: 'skills' },
  { from: 'agents', to: 'agents' },
]
```

## Files Changed

- `src/commands/tool-presets.ts` — update TOOL_PRESETS array
- `src/lib/config.ts` — update defaultConfig to match
- `__tests__/commands/sync.test.ts` — update/add tests for new mappings
- `__tests__/lib/config.test.ts` — update defaultConfig assertions if needed

## What's NOT Changing

- `ToolMapping` interface — `{ from: string; to: string }` stays the same
- `sync.ts` logic — no changes needed, it already uses `from/to` generically
- `symlink.ts` — no changes
- Codex Skills — deferred (requires basePath override or Approach B)
