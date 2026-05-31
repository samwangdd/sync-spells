import { ToolConfig } from '../lib/config';

export interface ToolPreset {
  label: string;
  key: string;
  configPath: string;
  mappings: { from: string; to: string }[];
}

export const TOOL_PRESETS: ToolPreset[] = [
  { label: 'Claude Code', key: 'claude-code', configPath: '~/.claude', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Agents',      key: 'agents',      configPath: '~/.agents', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Codex',       key: 'codex',       configPath: '~/.codex',  mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Cursor',      key: 'cursor',      configPath: '~/.cursor', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Kiro',        key: 'kiro',        configPath: '~/.kiro',   mappings: [{ from: 'global', to: 'skills' }] },
];

export const presetToToolConfig = (preset: ToolPreset): ToolConfig => ({
  enabled: true,
  configPath: preset.configPath,
  mappings: preset.mappings,
});
