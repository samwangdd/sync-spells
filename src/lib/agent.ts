export interface AgentFrontmatter {
  name: string;
  description: string;
  model?: string;
  tools?: string;
  color?: string;
}

export const isAgentFrontmatter = (value: unknown): value is AgentFrontmatter => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const f = value as Partial<AgentFrontmatter>;
  return typeof f.name === 'string' && typeof f.description === 'string';
};

export const parseAgentFile = (content: string): { data: AgentFrontmatter; body: string } => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('missing frontmatter');
  }

  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  if (!data.name) {
    throw new Error('missing name');
  }
  if (!data.description) {
    throw new Error('missing description');
  }

  let body = match[2];
  if (body.startsWith('\n')) {
    body = body.slice(1);
  }
  return { data: data as unknown as AgentFrontmatter, body };
};
