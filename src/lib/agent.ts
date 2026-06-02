import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';

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

const tomlString = (value: string): string => JSON.stringify(String(value ?? ''));

const tomlMultiline = (value: string): string => {
  const escaped = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"');
  return `"""${escaped}"""`;
};

export const toToml = (data: AgentFrontmatter, body: string): string => {
  const model = data.model || 'sonnet';
  return [
    `name = ${tomlString(data.name)}`,
    `description = ${tomlString(data.description)}`,
    `model = ${tomlString(model)}`,
    '',
    `developer_instructions = ${tomlMultiline(body)}`,
    '',
  ].join('\n');
};

export const toJson = (data: AgentFrontmatter, body: string): string => {
  const obj: Record<string, unknown> = {
    name: data.name,
    description: data.description,
    model: data.model || 'sonnet',
    prompt: body,
  };
  if (data.tools) {
    const tools = data.tools.split(',').map((t) => t.trim()).filter(Boolean);
    if (tools.length > 0) {
      obj.tools = tools;
    }
  }
  return JSON.stringify(obj, null, 2) + '\n';
};

export const listAgentFiles = async (agentsDir: string): Promise<string[]> => {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(agentsDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sub = path.join(agentsDir, entry.name);
    for (const file of await fs.readdir(sub, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.md') && file.name !== 'README.md') {
        out.push(path.join(sub, file.name));
      }
    }
  }

  return out.sort();
};
