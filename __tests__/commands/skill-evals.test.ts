import { afterEach, describe, expect, test } from '@jest/globals';
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { runExecutableEvalAgent } from '../../src/commands/skill-evals';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('skill eval command runner', () => {
  test('exchanges one JSON input and output with an executable without a shell', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-executable-'));
    tempDirs.push(dir);
    const executable = path.join(dir, 'runner.mjs');
    await writeFile(executable, `#!/usr/bin/env node
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const parsed = JSON.parse(input);
  process.stdout.write(JSON.stringify({ final_output: parsed.prompt, keys: Object.keys(parsed).sort() }));
});
`);
    await chmod(executable, 0o755);

    await expect(runExecutableEvalAgent(executable, {
      prompt: 'safe result',
      fixture: { mode: 'mock' },
      skill: null,
    })).resolves.toEqual({
      final_output: 'safe result',
      keys: ['fixture', 'prompt', 'skill'],
    });
  });

  test('the Codex adapter returns an empty baseline result without starting an agent', async () => {
    await expect(runExecutableEvalAgent(
      path.resolve('scripts/codex-skill-eval-runner.mjs'),
      { prompt: 'Handle it.', fixture: {}, skill: null },
    )).resolves.toEqual({ result: {}, final_output: '', action_trace: [] });
  });
});
