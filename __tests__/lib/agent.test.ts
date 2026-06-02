import { describe, expect, test } from '@jest/globals';
import { parseAgentFile, isAgentFrontmatter, toToml, toJson } from '../../src/lib/agent';

const SAMPLE = `---
name: git-executor
description: "Use when running git operations"
model: sonnet
tools: "Skill, Read, Bash"
color: blue
---

Agent instructions here.
Second line.
`;

describe('parseAgentFile', () => {
  test('parses frontmatter and body', () => {
    const { data, body } = parseAgentFile(SAMPLE);
    expect(data.name).toBe('git-executor');
    expect(data.description).toBe('Use when running git operations');
    expect(data.model).toBe('sonnet');
    expect(data.tools).toBe('Skill, Read, Bash');
    expect(body).toBe('Agent instructions here.\nSecond line.\n');
  });

  test('throws when frontmatter is missing', () => {
    expect(() => parseAgentFile('no frontmatter here')).toThrow('missing frontmatter');
  });

  test('throws when name is missing', () => {
    expect(() => parseAgentFile('---\ndescription: x\n---\nbody')).toThrow('missing name');
  });

  test('throws when description is missing', () => {
    expect(() => parseAgentFile('---\nname: x\n---\nbody')).toThrow('missing description');
  });
});

describe('isAgentFrontmatter', () => {
  test('accepts a valid object', () => {
    expect(isAgentFrontmatter({ name: 'a', description: 'b' })).toBe(true);
  });

  test('rejects when description is absent', () => {
    expect(isAgentFrontmatter({ name: 'a' })).toBe(false);
  });
});

describe('toToml', () => {
  test('emits name, description, model, and developer_instructions', () => {
    const out = toToml(
      { name: 'git-executor', description: 'desc', model: 'opus', tools: 'Read' },
      'body line one\nbody line two\n',
    );
    expect(out).toContain('name = "git-executor"');
    expect(out).toContain('description = "desc"');
    expect(out).toContain('model = "opus"');
    expect(out).toContain('developer_instructions = """body line one\nbody line two\n"""');
  });

  test('defaults model to sonnet when absent', () => {
    const out = toToml({ name: 'a', description: 'b' }, 'x\n');
    expect(out).toContain('model = "sonnet"');
  });

  test('escapes backslashes in the body so TOML stays valid', () => {
    const out = toToml({ name: 'a', description: 'b' }, 'path C:\\Users and regex \\d\n');
    expect(out).toContain('developer_instructions = """path C:\\\\Users and regex \\\\d\n"""');
  });
});

describe('toJson', () => {
  test('emits name, description, prompt, model and splits tools into an array', () => {
    const out = toJson(
      { name: 'jira', description: 'desc', model: 'sonnet', tools: 'Skill, Read, Bash' },
      'prompt body\n',
    );
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      name: 'jira',
      description: 'desc',
      model: 'sonnet',
      prompt: 'prompt body\n',
      tools: ['Skill', 'Read', 'Bash'],
    });
  });

  test('omits tools when frontmatter has none', () => {
    const parsed = JSON.parse(toJson({ name: 'a', description: 'b' }, 'p\n'));
    expect(parsed.tools).toBeUndefined();
    expect(parsed.model).toBe('sonnet');
  });
});
