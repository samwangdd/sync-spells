import { ToolConfig } from '../lib/config';

export interface ToolPreset {
  label: string;
  key: string;
  configPath: string;
  mappings: { from: string; to: string }[];
}

export const TOOL_PRESETS: ToolPreset[] = [
  {
    label: 'Claude Code',
    key: 'claude-code',
    configPath: '~/.claude',
    mappings: [
      { from: 'commands', to: 'commands' },
      { from: 'skills', to: 'skills' },
      { from: 'agents', to: 'agents' },
    ],
  },
  {
    label: 'Cursor',
    key: 'cursor',
    configPath: '~/.cursor',
    mappings: [{ from: 'commands', to: 'commands' }],
  },
  {
    label: 'Codex',
    key: 'codex',
    configPath: '~/.codex',
    mappings: [{ from: 'commands', to: 'commands' }],
  },
  {
    label: 'Kiro',
    key: 'kiro',
    configPath: '~/.kiro',
    mappings: [{ from: 'commands', to: 'commands' }],
  },
];

export const presetToToolConfig = (preset: ToolPreset): ToolConfig => ({
  enabled: true,
  configPath: preset.configPath,
  mappings: preset.mappings,
});
