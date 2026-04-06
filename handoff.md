# Handoff: Approach B — Unified Abstraction Layer

Date: 2026-04-06
Status: Deferred

## Background

Approach A extended tool presets with accurate `from/to` mappings, which works well for cases where file formats are compatible across tools. However, several limitations remain that Approach B would address.

## Problem Statement

1. **Codex Skills path is outside configPath**: Codex stores global skills at `~/.agents/skills/` instead of `~/.codex/skills/`. Current `ToolMapping` only supports subdirectories under `configPath`.

2. **Format incompatibility for Agents**:
   - Claude Code: `.md` / custom formats
   - Codex: `.toml` files with structured fields (name, description, model, instructions)
   - Kiro: `.json` files with fields (name, tools, allowedTools, prompt, model, hooks)

   A single agent source file cannot be symlinked to all three targets.

3. **Format differences for Skills**: While `SKILL.md` + YAML frontmatter is mostly compatible, each tool may support different frontmatter fields or directory conventions (e.g., `scripts/`, `references/`, `assets/`).

## Proposed Approach: Adapter Pattern

```
Source (canonical format)
    │
    ▼  Per-tool Adapter
    │
    ├── ClaudeCodeAdapter → symlink (passthrough)
    ├── CursorAdapter     → symlink (passthrough, format-compatible)
    ├── CodexAdapter      → write .toml for agents, handle ~/.agents/skills path
    └── KiroAdapter       → write .json for agents, rename commands→prompts
```

### Core Concepts

- **Canonical Spell Format**: Define a standard schema for each spell type (command, skill, agent) in the source directory
- **Adapter Interface**: Each tool implements an adapter with methods like `syncCommand()`, `syncSkill()`, `syncAgent()`
- **Format Conversion**: Adapters handle converting between canonical format and tool-specific format
- **Passthrough Optimization**: For format-compatible mappings (most skills, commands), adapters can still use symlinks

### Interface Sketch

```typescript
interface ToolAdapter {
  key: string;
  configPath: string;
  supportsCommands: boolean;
  supportsSkills: boolean;
  supportsAgents: boolean;

  syncCommand(source: string, target: string): Promise<SyncResult>;
  syncSkill(source: string, target: string): Promise<SyncResult>;
  syncAgent(source: string, target: string): Promise<SyncResult>;
}
```

### Key Design Questions to Resolve

1. **Canonical format for agents**: What should the source-of-truth agent definition look like? YAML? JSON? A new schema?
2. **Bidirectional sync**: Should changes in tool directories flow back to the source? Or one-way only?
3. **Partial format support**: If a tool doesn't support certain agent features (e.g., Kiro has `hooks` but Claude Code doesn't), how to handle the gap?
4. **Skill frontmatter normalization**: Should we normalize SKILL.md frontmatter fields across tools, or trust they're compatible?

### Migration Path from Approach A

1. Current `ToolMapping` becomes the simplest adapter (symlink passthrough)
2. Introduce `ToolAdapter` interface alongside existing `ToolMapping`
3. Codex agent adapter is the first non-trivial adapter (format conversion)
4. Gradually migrate other tools to adapters as needed

## References

- Cursor Skills docs: https://cursor.com/docs/skills
- Codex Skills: `~/.agents/skills/<skill-name>/SKILL.md`
- Codex Agents: `~/.codex/agents/<name>.toml`
- Kiro Agents: `~/.kiro/agents/*.json`
- Kiro Prompts: `~/.kiro/prompts/`
