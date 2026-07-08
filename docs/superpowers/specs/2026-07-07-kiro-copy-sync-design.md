# Kiro Copy-Mode Sync Design

Date: 2026-07-07
Status: approved (approach confirmed via user Q&A)

## Problem

Kiro cannot follow symlinks, but sync-spells distributes global skills as
per-skill symlinks (`mergeGlobalSkills` in `src/commands/sync-global.ts`).
Kiro is already a tool preset (`~/.kiro`, `global → skills`) yet its skills
never resolve because every entry is a symlink.

Symlink mode gets two properties for free that copy mode must reproduce
explicitly:

1. **Ownership** — `readlink` proves an entry was created by sync-spells, so
   update/prune never touches user-created entries.
2. **Freshness** — a link never goes stale; a copy does when the source
   changes.

## Decisions (user-approved)

| Decision | Choice |
|---|---|
| Architecture | Per-tool `syncMode: 'symlink' \| 'copy'` on `ToolConfig`; default `symlink`; Kiro preset defaults to `copy` |
| Ownership & freshness | Manifest file in the target dir recording owned entries + source content hash |
| Scope | Global skills channel only (`mergeGlobalSkills`); directory mappings and agents channels unchanged |

## Design

### Config (`src/lib/config.ts`, `src/commands/tool-presets.ts`)

- `export type SyncMode = 'symlink' | 'copy'`.
- `ToolConfig.syncMode?: SyncMode` — absent means `symlink`.
- `isToolConfig` accepts `undefined | 'symlink' | 'copy'`; anything else
  rejects the config (falls back to defaults, matching existing behavior).
- Kiro preset and `defaultConfig.kiro` gain `syncMode: 'copy'`; Kiro's
  default `mappings` is fixed from `[]` to `[{ from: 'global', to: 'skills' }]`
  to match the preset.

### Copy primitives (`src/lib/copy.ts`, new)

- `hashTree(root)` — sha256 over sorted relative paths + file contents;
  follows symlinks so a source skill containing links hashes by content.
- `copyTree(src, dest)` — `fs.cp(src, dest, { recursive: true, dereference: true })`;
  the copy contains no symlinks (Kiro requirement).
- Manifest at `<targetDir>/.sync-spells-manifest.json`:
  `{ "version": 1, "entries": { "<name>": { "hash": "<sha256>" } } }`.
  `readCopyManifest` returns an empty manifest when missing/invalid;
  `writeCopyManifest` writes it pretty-printed.

### Merge logic (`src/commands/sync-global.ts`)

`mergeGlobalSkills(config, toolKey, targetDir, desired, syncMode = 'symlink')`
dispatches; `runGlobalSync` passes `toolConfig.syncMode`. Copy branch, per
desired skill:

| Target entry state | Action | Result |
|---|---|---|
| missing | copy | `linked` |
| symlink owned by sync-spells (old symlink-mode leftovers) | unlink + copy | `updated` (migration) |
| foreign symlink | leave | `error` |
| real entry, in manifest, hash matches source | none | `skipped` |
| real entry, in manifest, hash differs | rm + copy | `updated` |
| real entry, not in manifest | leave | `error` (user-owned) |

Prune pass over `readdir(targetDir)`, skipping desired names and the
manifest file itself:

- name in manifest → rm recursively, drop manifest entry, `pruned`
- owned symlink (stale from symlink mode) → unlink, `pruned`
- anything else → untouched

Manifest is rewritten after each copy-mode merge. Target-dir preparation
(backup + replace a chained symlink dir, mkdir when missing) is identical
to symlink mode.

### Out of scope

- `runSync` directory mappings and agents `md` channel stay symlink-only
  (Kiro doesn't use them; its agents target is `json`, already a real file).
- `status` display for copy mode (global mapping already reports `real-dir`
  for every tool today).
- Detecting user edits inside a copied skill: a copy is overwritten only
  when the *source* hash changes; local drift persists until then.

## Testing

TDD, jest, mocked `os.homedir()` temp dirs (existing conventions):

- `__tests__/lib/copy.test.ts` — hashTree determinism & change detection,
  manifest round-trip, missing manifest → empty.
- `__tests__/commands/sync-global.test.ts` — copy-mode suite: fresh copy,
  unchanged skip, source-change update, prune, foreign entry error,
  owned-symlink migration, manifest file never treated as a skill.
- `__tests__/lib/config.test.ts` — `syncMode` validation.
- `__tests__/commands/tool-presets.test.ts` / setup — Kiro preset carries
  `syncMode: 'copy'` and the global mapping.
