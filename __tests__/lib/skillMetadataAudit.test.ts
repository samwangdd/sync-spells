import { describe, expect, it } from '@jest/globals';
import { auditSkillFrontmatter } from '../../src/lib/skillMetadataAudit';

describe('auditSkillFrontmatter', () => {
  it('reports skills missing a top-level version', () => {
    const issues = auditSkillFrontmatter(
      'workflow/example/SKILL.md',
      `---
name: example
description: "Use when testing metadata."
---
# Example
`
    );

    expect(issues).toContainEqual({
      code: 'missing-version',
      level: 'warning',
      path: 'workflow/example/SKILL.md',
      message: 'frontmatter should include top-level version'
    });
  });

  it('does not treat metadata.version as the skill version', () => {
    const issues = auditSkillFrontmatter(
      'coding/vercel-react-best-practices/SKILL.md',
      `---
name: vercel-react-best-practices
description: "Use when applying Vercel React guidance."
metadata:
  author: vercel
  version: 1.0.0
---
# Vercel React Best Practices
`
    );

    expect(issues).toContainEqual({
      code: 'missing-version',
      level: 'warning',
      path: 'coding/vercel-react-best-practices/SKILL.md',
      message: 'frontmatter should include top-level version'
    });
  });

  it('reports CLI skills that declare bins but omit cliHelp', () => {
    const issues = auditSkillFrontmatter(
      'workflow/lark-openapi-explorer/SKILL.md',
      `---
name: lark-openapi-explorer
version: 1.0.0
description: "Use when exploring Lark OpenAPI endpoints."
metadata:
  requires:
    bins: ["lark-cli"]
---
# Lark OpenAPI Explorer
`
    );

    expect(issues).toContainEqual({
      code: 'missing-cli-help',
      level: 'warning',
      path: 'workflow/lark-openapi-explorer/SKILL.md',
      message: 'metadata.cliHelp should describe the help command for required bins'
    });
  });

  it('accepts the lark-event metadata shape', () => {
    const issues = auditSkillFrontmatter(
      'workflow/lark-event/SKILL.md',
      `---
name: lark-event
version: 1.0.0
description: "Use when listening to Feishu/Lark events."
metadata:
  requires:
    bins: ["lark-cli"]
  cliHelp: "lark-cli event --help"
---
# Lark Event
`
    );

    expect(issues).toEqual([]);
  });
});
