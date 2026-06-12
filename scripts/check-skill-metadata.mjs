#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] || process.cwd();

const readSkillFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readSkillFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      files.push(fullPath);
    }
  }

  return files;
};

const stripQuotes = (value) => {
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

const parseInlineArray = (value) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  try {
    const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const audit = (relativePath, content) => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return [{ code: 'missing-frontmatter', path: relativePath, message: 'file should start with YAML frontmatter' }];
  }

  const block = match[1];
  const scalar = (key, options = {}) => {
    const prefix = options.allowIndented ? '^\\s*' : '^';
    const scalarMatch = block.match(new RegExp(`${prefix}${key}:\\s*(.+)$`, 'm'));
    return scalarMatch ? stripQuotes(scalarMatch[1]) : undefined;
  };
  const binsMatch = block.match(/^\s*bins:\s*(\[.*\])\s*$/m);
  const bins = binsMatch ? parseInlineArray(binsMatch[1]) : [];

  const issues = [];
  if (!scalar('version')) {
    issues.push({ code: 'missing-version', path: relativePath, message: 'frontmatter should include top-level version' });
  }
  if (bins.length > 0 && !scalar('cliHelp', { allowIndented: true })) {
    issues.push({
      code: 'missing-cli-help',
      path: relativePath,
      message: 'metadata.cliHelp should describe the help command for required bins'
    });
  }
  return issues;
};

const main = async () => {
  const absoluteRoot = path.resolve(root);
  const files = await readSkillFiles(absoluteRoot);
  const issues = [];

  for (const file of files.sort()) {
    const content = await fs.readFile(file, 'utf8');
    const relativePath = path.relative(absoluteRoot, file);
    issues.push(...audit(relativePath, content));
  }

  const byCode = issues.reduce((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {});

  console.log(`Checked ${files.length} SKILL.md file(s) under ${absoluteRoot}`);
  for (const [code, count] of Object.entries(byCode).sort()) {
    console.log(`${code}: ${count}`);
  }
  if (issues.length > 0) {
    console.log('');
    for (const issue of issues) {
      console.log(`${issue.code}\t${issue.path}\t${issue.message}`);
    }
  }

  process.exitCode = issues.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
