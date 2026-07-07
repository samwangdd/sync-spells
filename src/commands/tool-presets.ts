import { SyncMode, ToolConfig } from '../lib/config';

export interface ToolPreset {
  label: string;
  key: string;
  configPath: string;
  mappings: { from: string; to: string }[];
  syncMode?: SyncMode;
}

export const TOOL_PRESETS: ToolPreset[] = [
  { label: 'Claude Code', key: 'claude-code', configPath: '~/.claude', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Agents',      key: 'agents',      configPath: '~/.agents', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Codex',       key: 'codex',       configPath: '~/.codex',  mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Cursor',      key: 'cursor',      configPath: '~/.cursor', mappings: [{ from: 'global', to: 'skills' }] },
  // Kiro cannot follow symlinks, so its spells are materialized as real copies.
  { label: 'Kiro',        key: 'kiro',        configPath: '~/.kiro',   mappings: [{ from: 'global', to: 'skills' }], syncMode: 'copy' },
];

export const presetToToolConfig = (preset: ToolPreset): ToolConfig => ({
  enabled: true,
  configPath: preset.configPath,
  mappings: preset.mappings,
  ...(preset.syncMode ? { syncMode: preset.syncMode } : {}),
});
