import { describe, it, expect } from '@jest/globals';
import { parseFrontmatter } from '../../src/web/frontmatter';

describe('parseFrontmatter', () => {
  it('parses name and description', () => {
    const md = `---\nname: git-commit\ndescription: Use when committing code.\n---\n# Body`;
    expect(parseFrontmatter(md)).toEqual({ name: 'git-commit', description: 'Use when committing code.' });
  });

  it('strips surrounding quotes from values', () => {
    const md = `---\nname: lark-mail\ndescription: "Use when drafting Lark emails."\n---`;
    const r = parseFrontmatter(md);
    expect(r.description).toBe('Use when drafting Lark emails.');
  });

  it('parses version', () => {
    const md = `---\nname: lark-mail\nversion: 1.0.0\ndescription: x\n---`;
    expect(parseFrontmatter(md).version).toBe('1.0.0');
  });

  it('parses nested metadata.requires.bins inline array', () => {
    const md = `---\nname: lark-mail\nmetadata:\n  requires:\n    bins: ["lark-cli"]\n  cliHelp: "x"\n---`;
    expect(parseFrontmatter(md).requiresBins).toEqual(['lark-cli']);
  });

  it('parses bins with single quotes', () => {
    const md = `---\nname: x\nmetadata:\n  requires:\n    bins: ['a', 'b']\n---`;
    expect(parseFrontmatter(md).requiresBins).toEqual(['a', 'b']);
  });

  it('returns {} when there is no frontmatter block', () => {
    expect(parseFrontmatter('# Just a heading\n')).toEqual({});
  });

  it('degrades gracefully on malformed bins (no throw, no field)', () => {
    const md = `---\nname: x\nmetadata:\n  requires:\n    bins: [oops\n---`;
    const r = parseFrontmatter(md);
    expect(r.name).toBe('x');
    expect(r.requiresBins).toBeUndefined();
  });
});
