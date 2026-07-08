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

const kiroModel = (model?: string): string => {
  if (!model || model === 'sonnet') return 'claude-sonnet-5';
  if (model === 'opus') return 'claude-opus-4.8';
  if (model === 'haiku') return 'claude-haiku-4.5';
  return model;
};

const kiroToolMap: Record<string, string | null> = {
  Skill: null,
  Read: 'read',
  Grep: 'grep',
  Glob: 'glob',
  Bash: 'shell',
  Edit: 'write',
  MultiEdit: 'write',
  Write: 'write',
  TodoWrite: 'todo',
  Task: 'delegate',
  AskUserQuestion: null,
};

const kiroResources = [
  'skill://~/.kiro/skills/*/SKILL.md',
  'skill://.kiro/skills/*/SKILL.md',
  'file://AGENTS.md',
  'file://CLAUDE.md',
];

const kiroAllowedTools = new Set(['read', 'grep', 'glob', 'knowledge', 'thinking', 'todo', 'report', 'introspect']);

const kiroDeniedShellCommands = [
  'rm\\s+-rf\\b.*',
  '\\s-rf\\s.*',
  'find\\s+\\.\\s+-delete\\b.*',
  'shred\\b.*',
  'truncate\\b.*',
  'dd\\s+if=.*',
  'mkfs\\b.*',
  '>\\s*/dev/.*',
  'mv\\s+/dev/null\\b.*',
  'sudo\\b.*',
  'su\\b.*',
  'doas\\b.*',
  'chmod\\s+777\\b.*',
  'chmod\\s+-R\\s+777\\b.*',
  'chown\\b.*',
  'setfacl\\b.*',
  'systemctl\\s+enable\\b.*',
  'crontab\\b.*',
  'visudo\\b.*',
  'eval\\b.*',
  'exec\\s*\\(.*',
  'python\\s+-c\\b.*',
  'python3\\s+-c\\b.*',
  'node\\s+-e\\b.*',
  'perl\\s+-e\\b.*',
  'ruby\\s+-e\\b.*',
  'ld_preload\\b.*',
  'LD_PRELOAD\\b.*',
  'curl.*\\|\\s*sh\\b.*',
  'curl.*\\|\\s*bash\\b.*',
  'wget.*\\|\\s*sh\\b.*',
  'wget.*\\|\\s*bash\\b.*',
  'bash\\s+<\\(.*',
  'sh\\s+<\\(.*',
  'nc\\b.*',
  'netcat\\b.*',
  'ncat\\b.*',
  '/dev/tcp/.*',
  'curl\\s+-F\\b.*',
  'curl\\s+-X\\s+POST\\s+-d\\s+@.*',
  'scp\\b.*',
  'rsync\\b.*',
  'cat\\s+~/(\\.ssh|\\.aws|\\.kube).*',
  '^env(\\s|$).*',
  '^printenv(\\s|$).*',
  'history\\b.*',
  'grep\\s+-r\\b.*',
  'tar\\s+-cz\\b.*',
  'zip\\s+-r\\b.*',
  'git\\s+reset\\s+--hard\\b.*',
  'git\\s+clean\\s+-fd\\b.*',
  'git\\s+push\\s+-f\\b.*',
  'git\\s+push\\b.*--force.*',
];

const kiroAllowedShellCommands = [
  'pwd.*',
  'ls.*',
  'find . -maxdepth .*',
  'rg .*',
  'grep .*',
  'sed -n .*',
  'head .*',
  'tail .*',
  'cat [^~].*',
  'wc .*',
  'git status.*',
  'git branch.*',
  'git diff.*',
  'git log.*',
  'git show.*',
  'git ls-files.*',
  'npm test.*',
  'npm run test.*',
  'npm run lint.*',
  'npm run typecheck.*',
  'pnpm test.*',
  'pnpm lint.*',
  'pnpm typecheck.*',
  'yarn test.*',
  'yarn lint.*',
  'pytest.*',
  'ruff check.*',
  'mypy.*',
];

const kiroTools = (tools?: string): string[] => {
  if (!tools) return [];

  const mapped = tools
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean)
    .map((tool) => (Object.prototype.hasOwnProperty.call(kiroToolMap, tool) ? kiroToolMap[tool] : tool.toLowerCase()))
    .filter((tool): tool is string => Boolean(tool));

  return [...new Set(mapped)];
};

export const toJson = (data: AgentFrontmatter, body: string): string => {
  const tools = kiroTools(data.tools);
  const allowedTools = tools.filter((tool) => kiroAllowedTools.has(tool));
  const toolsSettings: Record<string, unknown> = {};
  if (tools.includes('write')) {
    toolsSettings.write = {
      allowedPaths: ['./**'],
      deniedPaths: ['~/.ssh/**', '~/.aws/**', '~/.kube/**', '~/.gnupg/**', '~/.kiro/**', '~/.claude/**', '~/.codex/**'],
    };
  }
  if (tools.includes('shell')) {
    toolsSettings.shell = {
      autoAllowReadonly: true,
      allowedCommands: kiroAllowedShellCommands,
      deniedCommands: kiroDeniedShellCommands,
    };
  }

  const obj: Record<string, unknown> = {
    name: data.name,
    description: data.description,
    model: kiroModel(data.model),
    prompt: body,
    resources: kiroResources,
    includeMcpJson: true,
    toolsSettings,
  };
  if (tools.length > 0) {
    obj.tools = tools;
  }
  if (allowedTools.length > 0) {
    obj.allowedTools = allowedTools;
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
