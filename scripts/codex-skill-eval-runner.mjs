#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let rawInput = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) rawInput += chunk;

const input = JSON.parse(rawInput);
if (input.skill === null) {
  process.stdout.write(JSON.stringify({ result: {}, final_output: '', action_trace: [] }));
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skill-eval-'));
const outputPath = path.join(tempDir, 'output.json');

const skillFiles = Object.entries(input.skill.files)
  .map(([name, content]) => `\n--- ${name} ---\n${content}`)
  .join('');
const prompt = `You are evaluating one agent skill in a fully simulated environment.
Use only the supplied prompt, fixture, and skill. Do not call tools or access external systems.
Return the decision as result, a concise user-facing final_output, and hypothetical commands or writes as action_trace.
Your entire final response must be one valid JSON object with exactly those three top-level keys and no Markdown fence.
action_trace must be an array of strings containing only commands or writes that would actually be attempted; never record skipped, forbidden, or no-op actions.
Use stable domain keys in result: *_link for URLs, *_jira for Jira keys, target_branch for branch targets, and stop_and_ask for blockers.

USER PROMPT:
${input.prompt}

FIXTURE:
${JSON.stringify(input.fixture, null, 2)}

SKILL SNAPSHOT:${skillFiles}
`;

const codexBin = process.env.CODEX_BIN || 'codex';
const run = spawnSync(codexBin, [
  'exec',
  '--ephemeral',
  '--ignore-rules',
  '--sandbox', 'read-only',
  '--skip-git-repo-check',
  '--output-last-message', outputPath,
  '-',
], {
  input: prompt,
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

try {
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(run.stderr || `codex exited ${run.status}`);
  process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(outputPath, 'utf8'))));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
