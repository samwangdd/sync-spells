export interface ParsedFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  requiresBins?: string[];
}

const stripQuotes = (value: string): string => {
  const t = value.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
};

export const parseFrontmatter = (content: string): ParsedFrontmatter => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  const out: ParsedFrontmatter = {};

  const scalar = (key: string): string | undefined => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? stripQuotes(m[1]) : undefined;
  };

  const name = scalar('name');
  const description = scalar('description');
  const version = scalar('version');
  if (name !== undefined) out.name = name;
  if (description !== undefined) out.description = description;
  if (version !== undefined) out.version = version;

  const bins = block.match(/^\s*bins:\s*(\[.*\])\s*$/m);
  if (bins) {
    try {
      const parsed: unknown = JSON.parse(bins[1].replace(/'/g, '"'));
      if (Array.isArray(parsed)) out.requiresBins = parsed.map((b) => String(b));
    } catch {
      // graceful degradation: leave requiresBins unset
    }
  }
  return out;
};
