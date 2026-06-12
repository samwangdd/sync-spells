export type SkillMetadataIssueCode = 'missing-frontmatter' | 'missing-version' | 'missing-cli-help';

export interface SkillMetadataIssue {
  code: SkillMetadataIssueCode;
  level: 'warning';
  path: string;
  message: string;
}

interface MinimalFrontmatter {
  version?: string;
  requiresBins: string[];
  cliHelp?: string;
}

const stripQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
};

const parseInlineArray = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed.replace(/'/g, '"'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item));
  } catch {
    return [];
  }
};

const parseFrontmatter = (content: string): MinimalFrontmatter | undefined => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return undefined;

  const block = match[1];
  const scalar = (key: string, options: { allowIndented?: boolean } = {}): string | undefined => {
    const prefix = options.allowIndented ? '^\\s*' : '^';
    const scalarMatch = block.match(new RegExp(`${prefix}${key}:\\s*(.+)$`, 'm'));
    return scalarMatch ? stripQuotes(scalarMatch[1]) : undefined;
  };

  const binsMatch = block.match(/^\s*bins:\s*(\[.*\])\s*$/m);

  return {
    version: scalar('version'),
    requiresBins: binsMatch ? parseInlineArray(binsMatch[1]) : [],
    cliHelp: scalar('cliHelp', { allowIndented: true })
  };
};

export const auditSkillFrontmatter = (path: string, content: string): SkillMetadataIssue[] => {
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return [
      {
        code: 'missing-frontmatter',
        level: 'warning',
        path,
        message: 'file should start with YAML frontmatter'
      }
    ];
  }

  const issues: SkillMetadataIssue[] = [];

  if (!frontmatter.version) {
    issues.push({
      code: 'missing-version',
      level: 'warning',
      path,
      message: 'frontmatter should include top-level version'
    });
  }

  if (frontmatter.requiresBins.length > 0 && !frontmatter.cliHelp) {
    issues.push({
      code: 'missing-cli-help',
      level: 'warning',
      path,
      message: 'metadata.cliHelp should describe the help command for required bins'
    });
  }

  return issues;
};
