# Unify Sync-Spells Design

Date: 2026-06-02

## Goal

Make the `spells` CLI the single control plane, with the iCloud `sync-spells/`
directory as a pure storage backend. Two structural gaps motivate this pass:

1. **Agents are not synced across tools.** The `agents/` spell type only has a
   Claude Code-compatible Markdown source; Codex (`.toml`) and Kiro (`.json`)
   use incompatible formats that a single symlink cannot satisfy.
2. **The iCloud directory is an implicit workspace.** The CLI hardcodes
   directory names and has no manifest declaring which directories it manages,
   so structure changes and health checks are fragile.

## Scope

In scope:

- Agents cross-tool format adaptation (converter approach, reusing symlink sync).
- A `workspace.json` manifest plus a `spells workspace` command namespace.
- Removal of confirmed-deprecated legacy artifacts.

Out of scope (deferred):

- Retiring `scripts/*.sh` — `publish.sh` is still wired into `zshrc-snippet.sh`
  and several scripts were touched recently; they remain the working
  implementation until the CLI reaches feature parity.
- Per-preset agent resolution, agent bidirectional sync, deep Kiro
  `hooks`/`allowedTools` mapping, and cross-tool frontmatter normalization.

## Resolved Decisions

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Agents schema | Do cross-tool format adaptation this iteration (adapter approach). |
| 2 | Legacy strategy | Remove confirmed-deprecated artifacts directly. |
| 3 | profile / preset terminology | Keep `preset` as the UX term; `profile` stays as the on-disk storage format (zero migration). Continues `skill-distribution-model.md`. |
| 4 | Workspace commands | Add a `spells workspace` namespace plus a `workspace.json` manifest. |

Implementation choice: **converter functions + reuse of existing symlink sync**
(chosen over per-tool adapter classes and a canonical-schema renderer) for the
smallest architectural risk and a clean upgrade path. Target tool formats this
iteration: Codex `.toml`, Kiro `.json`, and Claude Code / Cursor `.md`
passthrough.

## Workspace Manifest

A `workspace.json` file at the iCloud `sync-spells/` root declares the managed
workspace:

```json
{
  "version": 1,
  "library": "skill-category",
  "profiles": "profiles",
  "agents": "agents",
  "legacy": []
}
```

Fields are paths relative to the workspace root. The CLI reads them to locate
managed directories instead of hardcoding names, so `doctor`, `migrate`, and
`sync` all resolve structure through the manifest.

## Workspace Commands

A new `spells workspace` namespace:

- `workspace init` — write `workspace.json` in the current or specified iCloud
  directory; idempotent.
- `workspace doctor` — validate that (1) every directory named in the manifest
  exists, and (2) each tool symlink target resolves. This must catch the known
  critical bug: `~/.claude/skills` and `~/.agents/skills` currently point to a
  non-existent `skills-registry/global` (the real data lives under
  `skill-category/`), so global sync is silently broken. `doctor` reports the
  mismatch and suggests a fix.
- `workspace migrate` — structural migration from legacy directory names to the
  manifest-declared layout.

## Agents Adapter

**Source of truth**: `agents/{global,coding,system}/*.md`, in canonical
Claude Code-compatible Markdown with YAML frontmatter (`name`, `description`,
`model`, `tools`, `color`) plus a Markdown body. This is also the human-editable
format; tool-specific output is generated and never edited as source.

**Distribution**: flat and global — every agent file is synced into each enabled
tool's agents directory, matching the current `scripts/sync-agents.sh` behavior.
The `global` / `coding` / `system` subdirectories are organizational scope hints
only. Per-preset agent resolution is deferred.

**Converter map**:

| Tool | Target | Strategy |
|------|--------|----------|
| Claude Code | `~/.claude/agents/<name>.md` | symlink passthrough |
| Cursor | `~/.cursor/agents/<name>.md` | symlink passthrough |
| Codex | `~/.codex/agents/<name>.toml` | `toToml` (port from `sync-agents.sh`) |
| Kiro | `~/.kiro/agents/<name>.json` | `toJson` (new this iteration) |

**Codex `toToml`** (ported from `scripts/sync-agents.sh`): emits `name`,
`description`, `model` (default `sonnet`), and `developer_instructions` (the
Markdown body as a TOML multiline string).

**Kiro `toJson`** (new): emits `name`, `description`, `tools`, `prompt` (the
Markdown body), and `model`. Tool-specific fields not present in the canonical
source (`hooks`, `allowedTools`) are omitted rather than guessed.

**Sync integration**: `spells sync` gains an agents pass. Passthrough targets use
the existing symlink state machine (`linked` / `missing` / `real-dir` /
`broken`); converter targets write the generated file. When a source `.md`
changes, converter output is regenerated.

## Type / Config Changes

- `Config` gains an optional `agents` field and workspace awareness (reads
  `workspace.json`).
- A new `AgentFrontmatter` type with a runtime type guard, following the
  existing `isConfig` / `isToolConfig` validation style in `lib/config.ts`.
- `ToolConfig` gains `supportsAgents` and an agents target path.

## Legacy Cleanup

Remove (confirmed deprecated, not referenced by any tool symlink or the CLI
source):

- `sync-spells.json` — superseded by `~/.sync-spells/config.json` (last touched
  Nov 2025, empty mappings).
- `skills-registry-backup-2026-05-31*` — a one-off migration backup snapshot.
- `legacy-commands/` — 40 old slash-command files, git-tracked but not symlinked
  into any tool; removed in full.

Retain (not yet deprecated):

- `scripts/*.sh` — `publish.sh` is referenced by `zshrc-snippet.sh` and several
  scripts are the current working implementation. Retire in a separate pass once
  the CLI reaches parity.

## Compatibility Promises

- Existing `profiles/*.json` files continue to load unchanged; `preset` is only
  a naming layer over them.
- `spells profiles` commands continue to work.
- Existing tool symlinks for skills are not force-rewritten by this pass.
- Agents passthrough targets reuse the existing backup-before-replace behavior.

## Implementation Notes

The Codex TOML converter already exists in `scripts/sync-agents.sh` as embedded
Node and serves as the reference for the TypeScript port. The Kiro JSON
converter is the only genuinely new converter. All file generation must be
idempotent and must back up any pre-existing real file before replacing it,
consistent with the current sync state machine.
