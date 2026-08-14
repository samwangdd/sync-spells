import { afterEach, describe, expect, test } from '@jest/globals';
import { execFile as execFileCallback } from 'child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import {
  auditSkillEval,
  auditSkillRegistry,
  computeEvalDigest,
  computeSkillDigest,
  collectGitChangedPaths,
  gradeAssertions,
  parseEvalSuite,
  runSkillEval,
} from '../../src/lib/skillEvals';

const tempDirs: string[] = [];
const execFile = promisify(execFileCallback);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('skill eval suites', () => {
  test('parses a standard eval suite', () => {
    const suite = parseEvalSuite({
      schema_version: 1,
      skill: 'example-skill',
      evaluation_protocol: 'Run against mocked tools only.',
      cases: [
        {
          id: 'keeps-the-safe-path',
          prompt: 'Handle the request.',
          fixture: { mode: 'mock' },
          assertions: [
            { id: 'safe', target: 'result.mode', operator: 'equals', value: 'mock' },
          ],
        },
      ],
    });

    expect(suite.skill).toBe('example-skill');
    expect(suite.cases[0].assertions[0].operator).toBe('equals');
  });

  test('rejects duplicate case identifiers', () => {
    const repeatedCase = {
      id: 'same-case',
      prompt: 'Handle the request.',
      fixture: {},
      assertions: [
        { id: 'result', target: 'final_output', operator: 'contains', value: 'done' },
      ],
    };
    const suite = {
      schema_version: 1,
      skill: 'example-skill',
      evaluation_protocol: 'Mock only.',
      cases: [repeatedCase, repeatedCase],
    };

    expect(() => parseEvalSuite(suite)).toThrow(/duplicate case id: same-case/);
  });

  test('skill digest tracks behavior files but ignores verification output', async () => {
    const skillDir = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-digest-'));
    tempDirs.push(skillDir);
    await mkdir(path.join(skillDir, 'evals'));
    await writeFile(path.join(skillDir, 'SKILL.md'), 'version: 1.0.0\nfirst behavior\n');
    await writeFile(path.join(skillDir, 'evals', 'evals.json'), '{}\n');

    const first = await computeSkillDigest(skillDir);
    await writeFile(path.join(skillDir, 'evals', 'verification.json'), '{"run_id":"one"}\n');
    expect(await computeSkillDigest(skillDir)).toBe(first);
    await writeFile(path.join(skillDir, 'log.md'), 'Historical notes.\n');
    await writeFile(path.join(skillDir, 'SKILL.md.bak.20260814'), 'Old behavior.\n');
    expect(await computeSkillDigest(skillDir)).toBe(first);

    await writeFile(path.join(skillDir, 'SKILL.md'), 'version: 1.0.0\nchanged behavior\n');
    expect(await computeSkillDigest(skillDir)).not.toBe(first);
  });

  test('invalidates verification when skill behavior changes', async () => {
    const skillDir = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-stale-'));
    tempDirs.push(skillDir);
    await mkdir(path.join(skillDir, 'evals'));
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: example-skill\nversion: 1.0.0\ndescription: Use when testing.\n---\n\nFirst behavior.\n',
    );
    await writeFile(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      schema_version: 1,
      skill: 'example-skill',
      evaluation_protocol: 'Mock only.',
      cases: [{
        id: 'case-one',
        prompt: 'Handle it.',
        fixture: {},
        assertions: [{ id: 'done', target: 'final_output', operator: 'contains', value: 'done' }],
      }],
    }));
    await writeFile(path.join(skillDir, 'evals', 'verification.json'), JSON.stringify({
      schema_version: 1,
      skill_version: '1.0.0',
      skill_digest: await computeSkillDigest(skillDir),
      evals_digest: await computeEvalDigest(skillDir),
      baseline_ref: 'HEAD^',
      run_id: 'run-1',
      status: 'passed',
      passed: 1,
      total: 1,
      verified_at: '2026-08-14T00:00:00.000Z',
      workspace: '/tmp/run-1',
    }));

    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual([]);

    const evalsPath = path.join(skillDir, 'evals', 'evals.json');
    const originalEvals = await readFile(evalsPath, 'utf8');
    await writeFile(evalsPath, originalEvals.replace('Handle it.', 'Handle it safely.'));
    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'stale-evals-digest', level: 'error' }),
    ]));
    await writeFile(evalsPath, originalEvals);

    const verificationPath = path.join(skillDir, 'evals', 'verification.json');
    const verification = JSON.parse(await readFile(verificationPath, 'utf8'));
    await writeFile(verificationPath, JSON.stringify({ ...verification, status: 'failed', passed: 0 }));
    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'failed-verification', level: 'error' }),
    ]));
    await writeFile(verificationPath, JSON.stringify(verification));

    await writeFile(verificationPath, '{}\n');
    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual([
      expect.objectContaining({ code: 'invalid-verification', level: 'error' }),
    ]);
    await writeFile(verificationPath, JSON.stringify(verification));

    await writeFile(verificationPath, JSON.stringify({ ...verification, skill_version: '0.9.0' }));
    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'stale-skill-version', level: 'error' }),
    ]));
    await writeFile(verificationPath, JSON.stringify(verification));

    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: example-skill\nversion: 1.0.0\n---\n\nChanged.\n');
    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'stale-skill-digest', level: 'error' }),
    ]));
    expect(await auditSkillEval(skillDir, { enforce: false })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'stale-skill-digest', level: 'warning' }),
    ]));
  });

  test('warns for untouched legacy skills but blocks changed skills without evals', async () => {
    const skillDir = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-missing-'));
    tempDirs.push(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '# Legacy skill\n');

    expect(await auditSkillEval(skillDir, { enforce: false })).toEqual([
      expect.objectContaining({ code: 'missing-evals', level: 'warning' }),
    ]);
    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual([
      expect.objectContaining({ code: 'missing-evals', level: 'error' }),
    ]);
  });

  test('reports an invalid eval suite before checking verification', async () => {
    const skillDir = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-invalid-'));
    tempDirs.push(skillDir);
    await mkdir(path.join(skillDir, 'evals'));
    await writeFile(path.join(skillDir, 'SKILL.md'), '# Invalid suite\n');
    await writeFile(path.join(skillDir, 'evals', 'evals.json'), '{"schema_version":1,"cases":[]}\n');

    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual([
      expect.objectContaining({ code: 'invalid-evals', level: 'error' }),
    ]);
  });

  test('blocks a valid suite that has no verification', async () => {
    const skillDir = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-unverified-'));
    tempDirs.push(skillDir);
    await mkdir(path.join(skillDir, 'evals'));
    await writeFile(path.join(skillDir, 'SKILL.md'), '# Unverified suite\n');
    await writeFile(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      schema_version: 1,
      skill: 'unverified',
      evaluation_protocol: 'Mock only.',
      cases: [{
        id: 'case-one',
        prompt: 'Handle it.',
        fixture: {},
        assertions: [{ id: 'done', target: 'final_output', operator: 'contains', value: 'done' }],
      }],
    }));

    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual([
      expect.objectContaining({ code: 'missing-verification', level: 'error' }),
    ]);
  });

  test('blocks external-system evals that are not explicitly mock-only', async () => {
    const skillDir = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-unsafe-'));
    tempDirs.push(skillDir);
    await mkdir(path.join(skillDir, 'evals'));
    await writeFile(path.join(skillDir, 'SKILL.md'), '# Unsafe suite\n');
    await writeFile(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      schema_version: 1,
      skill: 'jira-writer',
      evaluation_protocol: 'Run the Jira transition.',
      cases: [{
        id: 'transition',
        prompt: 'Move Jira WEB-1 to done.',
        fixture: {},
        assertions: [{ id: 'done', target: 'final_output', operator: 'contains', value: 'done' }],
      }],
    }));

    expect(await auditSkillEval(skillDir, { enforce: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsafe-external-eval', level: 'error' }),
    ]));
  });

  test('grades equals, contains, and not_contains against structured output', () => {
    const graded = gradeAssertions([
      { id: 'mode', target: 'result.mode', operator: 'equals', value: 'mock' },
      { id: 'mentions-head', target: 'final_output', operator: 'contains', value: 'abc123' },
      { id: 'no-push', target: 'action_trace', operator: 'not_contains', value: 'git push' },
    ], {
      result: { mode: 'mock' },
      final_output: 'Verified abc123.',
      action_trace: ['git status'],
    });

    expect(graded).toEqual([
      expect.objectContaining({ id: 'mode', passed: true }),
      expect.objectContaining({ id: 'mentions-head', passed: true }),
      expect.objectContaining({ id: 'no-push', passed: true }),
    ]);
  });

  test('contains searches inside string entries in an action trace', () => {
    expect(gradeAssertions([
      { id: 'no-push', target: 'action_trace', operator: 'not_contains', value: 'git push' },
    ], {
      action_trace: ['skip git push because the branch is unchanged'],
    })).toEqual([
      expect.objectContaining({ id: 'no-push', passed: false }),
    ]);
  });

  test('normalizes common MR link aliases and structured trace entries', () => {
    expect(gradeAssertions([
      { id: 'link', target: 'result.pr_link', operator: 'equals', value: 'https://example.test/mr/1' },
      { id: 'view', target: 'action_trace', operator: 'contains', value: 'glab mr view' },
    ], {
      result: { mr_link: 'https://example.test/mr/1' },
      action_trace: [{ command: 'glab mr view 1' }],
    })).toEqual([
      expect.objectContaining({ id: 'link', passed: true }),
      expect.objectContaining({ id: 'view', passed: true }),
    ]);
  });

  test('equals compares objects independently of property insertion order', () => {
    expect(gradeAssertions([
      { id: 'object', target: 'result.value', operator: 'equals', value: { first: 1, second: 2 } },
    ], {
      result: { value: { second: 2, first: 1 } },
    })).toEqual([
      expect.objectContaining({ id: 'object', passed: true }),
    ]);
  });

  test('runs isolated baseline and current snapshots without leaking assertions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-run-'));
    tempDirs.push(root);
    const skillDir = path.join(root, 'current');
    const baselineDir = path.join(root, 'baseline');
    const workspaceRoot = path.join(root, 'runs');
    await mkdir(path.join(skillDir, 'evals'), { recursive: true });
    await mkdir(baselineDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: example\nversion: 2.0.0\n---\ncurrent behavior\n');
    await writeFile(path.join(baselineDir, 'SKILL.md'), '---\nname: example\nversion: 1.0.0\n---\nbaseline behavior\n');
    await writeFile(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      schema_version: 1,
      skill: 'example',
      evaluation_protocol: 'Use fixtures only.',
      cases: [{
        id: 'regression',
        prompt: 'Handle it.',
        fixture: { request: 'safe' },
        assertions: [{ id: 'done', target: 'final_output', operator: 'equals', value: 'done' }],
      }],
    }));

    const received: unknown[] = [];
    const result = await runSkillEval({
      skillDir,
      baselineDir,
      baselineRef: 'HEAD^',
      workspaceRoot,
      runId: 'run-isolated',
      now: () => new Date('2026-08-14T00:00:00.000Z'),
      runner: async (input) => {
        received.push(input);
        const skillText = input.skill?.files['SKILL.md'] ?? '';
        return { final_output: skillText.includes('current behavior') ? 'done' : 'wrong' };
      },
    });

    expect(result.status).toBe('passed');
    expect(received).toHaveLength(2);
    for (const input of received as Array<Record<string, unknown>>) {
      expect(Object.keys(input).sort()).toEqual(['fixture', 'prompt', 'skill']);
      expect(JSON.stringify(input)).not.toContain('assertions');
      expect(JSON.stringify(input)).not.toContain('"done"');
    }
    expect(JSON.parse(await readFile(
      path.join(skillDir, 'evals', 'verification.json'),
      'utf8',
    ))).toEqual(expect.objectContaining({
      run_id: 'run-isolated',
      baseline_ref: 'HEAD^',
      status: 'passed',
      passed: 1,
      total: 1,
    }));
    await expect(readFile(
      path.join(workspaceRoot, 'run-isolated', 'regression', 'current', 'grading.json'),
      'utf8',
    )).resolves.toContain('"passed": true');

    await expect(runSkillEval({
      skillDir,
      baselineDir: null,
      baselineRef: 'HEAD^',
      workspaceRoot,
      runId: 'false-baseline',
      runner: async () => ({}),
    })).rejects.toThrow(/empty baseline ref/);
  });

  test('refuses an unsafe external suite before invoking the runner', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-run-unsafe-'));
    tempDirs.push(root);
    await mkdir(path.join(root, 'evals'));
    await writeFile(path.join(root, 'SKILL.md'), '---\nname: jira-writer\nversion: 1.0.0\n---\n');
    await writeFile(path.join(root, 'evals', 'evals.json'), JSON.stringify({
      schema_version: 1,
      skill: 'jira-writer',
      evaluation_protocol: 'Run Jira transitions.',
      cases: [{
        id: 'unsafe',
        prompt: 'Update Jira.',
        fixture: {},
        assertions: [{ id: 'done', target: 'final_output', operator: 'equals', value: 'done' }],
      }],
    }));
    let calls = 0;

    await expect(runSkillEval({
      skillDir: root,
      baselineDir: null,
      baselineRef: 'empty',
      runner: async () => { calls += 1; return {}; },
    })).rejects.toThrow(/mock-only/);
    expect(calls).toBe(0);
  });

  test('blocks changed skills while only warning for untouched legacy skills', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-gate-'));
    tempDirs.push(root);
    const changed = path.join(root, 'coding', 'changed-skill');
    const legacy = path.join(root, 'workflow', 'legacy-skill');
    const thirdParty = path.join(root, 'third-party', 'vendor-skill');
    await mkdir(changed, { recursive: true });
    await mkdir(legacy, { recursive: true });
    await mkdir(thirdParty, { recursive: true });
    await writeFile(path.join(changed, 'SKILL.md'), '# Changed\n');
    await writeFile(path.join(legacy, 'SKILL.md'), '# Legacy\n');
    await writeFile(path.join(thirdParty, 'SKILL.md'), '# Vendor\n');

    const report = await auditSkillRegistry(root, {
      changedPaths: [path.join('coding', 'changed-skill', 'SKILL.md')],
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'coding/changed-skill', code: 'missing-evals', level: 'error' }),
      expect.objectContaining({ skill: 'workflow/legacy-skill', code: 'missing-evals', level: 'warning' }),
    ]));
    expect(report.issues.some((issue) => issue.skill.includes('third-party'))).toBe(false);
    expect(report.passed).toBe(false);
  });

  test('collects tracked and untracked registry changes relative to a Git baseline', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'skill-evals-git-'));
    tempDirs.push(root);
    const registry = path.join(root, 'skill-category');
    const skillDir = path.join(registry, 'coding', 'example');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '# Initial\n');
    await execFile('git', ['init'], { cwd: root });
    await execFile('git', ['add', '.'], { cwd: root });
    await execFile('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], { cwd: root });

    await writeFile(path.join(skillDir, 'SKILL.md'), '# Changed\n');
    await mkdir(path.join(skillDir, 'evals'));
    await writeFile(path.join(skillDir, 'evals', 'evals.json'), '{}\n');

    expect(await collectGitChangedPaths(registry, 'HEAD')).toEqual([
      path.join('coding', 'example', 'SKILL.md'),
      path.join('coding', 'example', 'evals', 'evals.json'),
    ]);
  });
});
