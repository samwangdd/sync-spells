import { describe, expect, test } from '@jest/globals';
import { TOOL_PRESETS, presetToToolConfig } from '../../src/commands/tool-presets';

describe('TOOL_PRESETS', () => {
  test('claude-code/agents/codex/cursor each map global to skills', () => {
    for (const key of ['claude-code', 'agents', 'codex', 'cursor']) {
      const preset = TOOL_PRESETS.find(p => p.key === key);
      expect(preset).toBeDefined();
      expect(preset!.mappings).toEqual([{ from: 'global', to: 'skills' }]);
    }
  });

  test('agents preset points at ~/.agents', () => {
    const agents = TOOL_PRESETS.find(p => p.key === 'agents');
    expect(agents!.configPath).toBe('~/.agents');
  });

  test('presetToToolConfig enables the tool', () => {
    const preset = TOOL_PRESETS.find(p => p.key === 'claude-code')!;
    expect(presetToToolConfig(preset).enabled).toBe(true);
  });
});
