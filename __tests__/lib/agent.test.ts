import { describe, expect, test } from '@jest/globals';
import { parseAgentFile, isAgentFrontmatter } from '../../src/lib/agent';

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
