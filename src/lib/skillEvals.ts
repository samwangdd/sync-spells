import { createHash } from 'crypto';
import { execFile as execFileCallback } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { isDeepStrictEqual, promisify } from 'util';
import { z } from 'zod';

const execFile = promisify(execFileCallback);

const evalAssertionSchema = z.object({
  id: z.string().min(1),
  target: z.string().min(1),
  operator: z.enum(['equals', 'contains', 'not_contains']),
  value: z.unknown(),
});

const evalCaseSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  fixture: z.unknown(),
  assertions: z.array(evalAssertionSchema).min(1),
}).passthrough();

const evalSuiteSchema = z.object({
  schema_version: z.literal(1),
  skill: z.string().min(1),
  evaluation_protocol: z.string().min(1),
  cases: z.array(evalCaseSchema).min(1),
}).superRefine((suite, context) => {
  const seen = new Set<string>();
  for (const evalCase of suite.cases) {
    if (seen.has(evalCase.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate case id: ${evalCase.id}`,
        path: ['cases'],
      });
    }
    seen.add(evalCase.id);
  }
});

export type EvalSuite = z.infer<typeof evalSuiteSchema>;
export type EvalAssertion = z.infer<typeof evalAssertionSchema>;

const verificationSchema = z.object({
  schema_version: z.literal(1),
  skill_version: z.string().min(1),
  skill_digest: z.string().regex(/^[a-f0-9]{64}$/),
  evals_digest: z.string().regex(/^[a-f0-9]{64}$/),
  baseline_ref: z.string().min(1),
  run_id: z.string().min(1),
  status: z.enum(['passed', 'failed']),
  passed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  verified_at: z.string().datetime(),
  workspace: z.string().min(1),
});

export type EvalVerification = z.infer<typeof verificationSchema>;

export interface SkillEvalIssue {
  code: string;
  level: 'warning' | 'error';
  message: string;
}

export interface RegistrySkillEvalIssue extends SkillEvalIssue {
  skill: string;
}

export interface SkillEvalRegistryReport {
  passed: boolean;
  issues: RegistrySkillEvalIssue[];
}

/** Throws one stable, user-facing error when a registry report contains blocking issues. */
export const assertSkillEvalGate = (report: SkillEvalRegistryReport): void => {
  if (report.passed) return;
  const failures = report.issues
    .filter((issue) => issue.level === 'error')
    .map((issue) => `${issue.skill}: ${issue.code}`)
    .join('\n');
  throw new Error(`Skill eval gate failed:\n${failures}`);
};

export interface AssertionGrade {
  id: string;
  passed: boolean;
  actual: unknown;
}

export interface AgentSkillSnapshot {
  files: Record<string, string>;
}

export interface EvalAgentInput {
  prompt: string;
  fixture: unknown;
  skill: AgentSkillSnapshot | null;
}

export type EvalRunner = (input: EvalAgentInput) => Promise<unknown>;

export interface RunSkillEvalOptions {
  skillDir: string;
  baselineDir: string | null;
  baselineRef: string;
  runner: EvalRunner;
  workspaceRoot?: string;
  runId?: string;
  now?: () => Date;
}

export const parseEvalSuite = (value: unknown): EvalSuite => evalSuiteSchema.parse(value);

const rawValueAtPath = (root: unknown, target: string): unknown => target
  .split('.')
  .reduce<unknown>((value, segment) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[segment];
  }, root);

const valueAtPath = (root: unknown, target: string): unknown => {
  const exact = rawValueAtPath(root, target);
  if (exact !== undefined) return exact;
  if (target === 'result.pr_link') {
    return rawValueAtPath(root, 'result.mr_link') ?? rawValueAtPath(root, 'result.mr_url');
  }
  if (target.endsWith('_link')) return rawValueAtPath(root, target.replace(/_link$/, '_url'));
  return undefined;
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  isDeepStrictEqual(left, right);

const valueContains = (actual: unknown, expected: unknown): boolean => {
  if (typeof actual === 'string') return actual.includes(String(expected));
  if (Array.isArray(actual)) {
    return actual.some((item) =>
      valuesEqual(item, expected) ||
      valueContains(item, expected));
  }
  if (typeof actual === 'object' && actual !== null) {
    return Object.values(actual).some((item) => valueContains(item, expected));
  }
  return false;
};

export const gradeAssertions = (
  assertions: EvalAssertion[],
  output: unknown,
): AssertionGrade[] => assertions.map((assertion) => {
  const actual = valueAtPath(output, assertion.target);
  const contains = valueContains(actual, assertion.value);
  const passed = assertion.operator === 'equals'
    ? valuesEqual(actual, assertion.value)
    : assertion.operator === 'contains'
      ? contains
      : !contains;
  return { id: assertion.id, passed, actual };
});

/**
 * Whether a skill-relative path contributes to the behavior digest. Generated eval
 * artifacts, history logs, editor backups, and caches are excluded so that churn in
 * them neither moves the digest nor marks the skill as changed.
 */
const isBehaviorPath = (relative: string): boolean => {
  const segments = relative.split(path.sep);
  if (segments[0] === 'evals') return false;
  return !segments.some((segment) =>
    segment === 'log.md' ||
    segment === '.DS_Store' ||
    segment === '__pycache__' ||
    segment.includes('.bak.'));
};

const listBehaviorFiles = async (root: string, relative = ''): Promise<string[]> => {
  const absolute = path.join(root, relative);
  const stat = await fs.stat(absolute);
  if (!stat.isDirectory()) return [relative];

  const files: string[] = [];
  for (const entry of (await fs.readdir(absolute)).sort()) {
    const child = path.join(relative, entry);
    if (!isBehaviorPath(child)) continue;
    files.push(...await listBehaviorFiles(root, child));
  }
  return files;
};

/** Hashes the complete skill behavior tree while excluding generated eval artifacts. */
export const computeSkillDigest = async (skillDir: string): Promise<string> => {
  const digest = createHash('sha256');
  for (const relative of await listBehaviorFiles(skillDir)) {
    digest.update(relative);
    digest.update('\0');
    digest.update(await fs.readFile(path.join(skillDir, relative)));
    digest.update('\0');
  }
  return digest.digest('hex');
};

export const computeEvalDigest = async (skillDir: string): Promise<string> => {
  const content = await fs.readFile(path.join(skillDir, 'evals', 'evals.json'));
  return createHash('sha256').update(content).digest('hex');
};

const unsafeExternalEval = (suite: EvalSuite): boolean => {
  const externalSurface = JSON.stringify(suite);
  const usesExternalWrites = /\b(?:jira|lark|feishu|taskboard)\b|git\s+push/i.test(externalSurface);
  const declaresMockOnly = /mock(?:ed|-only)?|no real|(?:禁止|不得|不允许).*真实/i.test(
    suite.evaluation_protocol,
  );
  return usesExternalWrites && !declaresMockOnly;
};

const snapshotSkill = async (skillDir: string | null): Promise<AgentSkillSnapshot | null> => {
  if (skillDir === null) return null;
  const files: Record<string, string> = {};
  for (const relative of await listBehaviorFiles(skillDir)) {
    files[relative] = await fs.readFile(path.join(skillDir, relative), 'utf8');
  }
  return { files };
};

const skillVersion = async (skillDir: string): Promise<string> => {
  const content = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  return content.match(/^version:\s*([^\s]+)\s*$/m)?.[1] ?? 'unversioned';
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

/** Runs the same suite against isolated baseline/current skill snapshots and records auditable evidence. */
export const runSkillEval = async (options: RunSkillEvalOptions): Promise<EvalVerification> => {
  const emptyBaselineRef = /^empty(?::|$)/.test(options.baselineRef);
  if (options.baselineDir === null && !emptyBaselineRef) {
    throw new Error('an empty baseline requires an empty baseline ref');
  }
  if (options.baselineDir !== null && emptyBaselineRef) {
    throw new Error('a materialized baseline requires a non-empty Git baseline ref');
  }
  const suite = parseEvalSuite(JSON.parse(
    await fs.readFile(path.join(options.skillDir, 'evals', 'evals.json'), 'utf8'),
  ));
  if (unsafeExternalEval(suite)) {
    throw new Error('external-system evals must declare mock-only execution');
  }
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? `${now().toISOString().replace(/[:.]/g, '-')}-${suite.skill}`;
  const workspace = path.resolve(
    options.workspaceRoot ?? path.join(os.homedir(), '.sync-spells', 'eval-runs'),
    runId,
  );
  const snapshots = {
    baseline: await snapshotSkill(options.baselineDir),
    current: await snapshotSkill(options.skillDir),
  };
  let baselineFailed = false;
  let passed = 0;
  let total = 0;

  for (const evalCase of suite.cases) {
    for (const variant of ['baseline', 'current'] as const) {
      const input: EvalAgentInput = {
        prompt: evalCase.prompt,
        fixture: evalCase.fixture,
        skill: snapshots[variant],
      };
      const output = await options.runner(input);
      const grading = gradeAssertions(evalCase.assertions, output);
      const variantDir = path.join(workspace, evalCase.id, variant);
      await writeJson(path.join(variantDir, 'input.json'), input);
      await writeJson(path.join(variantDir, 'output.json'), output);
      await writeJson(path.join(variantDir, 'grading.json'), grading);

      if (variant === 'baseline') {
        baselineFailed ||= grading.some((grade) => !grade.passed);
      } else {
        total += grading.length;
        passed += grading.filter((grade) => grade.passed).length;
      }
    }
  }

  const status = baselineFailed && passed === total ? 'passed' : 'failed';
  const verification: EvalVerification = {
    schema_version: 1,
    skill_version: await skillVersion(options.skillDir),
    skill_digest: await computeSkillDigest(options.skillDir),
    evals_digest: await computeEvalDigest(options.skillDir),
    baseline_ref: options.baselineRef,
    run_id: runId,
    status,
    passed,
    total,
    verified_at: now().toISOString(),
    workspace,
  };
  await writeJson(path.join(workspace, 'verification.json'), verification);
  await writeJson(path.join(options.skillDir, 'evals', 'verification.json'), verification);
  return verification;
};

export const auditSkillEval = async (
  skillDir: string,
  options: { enforce: boolean },
): Promise<SkillEvalIssue[]> => {
  const level = options.enforce ? 'error' : 'warning';
  try {
    await fs.access(path.join(skillDir, 'evals', 'evals.json'));
  } catch {
    return [{
      code: 'missing-evals',
      level,
      message: 'evals/evals.json is required for changed skills',
    }];
  }
  let suite: EvalSuite;
  try {
    suite = parseEvalSuite(JSON.parse(
      await fs.readFile(path.join(skillDir, 'evals', 'evals.json'), 'utf8'),
    ));
  } catch (error) {
    return [{
      code: 'invalid-evals',
      level,
      message: error instanceof Error ? error.message : String(error),
    }];
  }
  if (unsafeExternalEval(suite)) {
    return [{
      code: 'unsafe-external-eval',
      level,
      message: 'external-system evals must declare mock-only execution',
    }];
  }
  const verificationPath = path.join(skillDir, 'evals', 'verification.json');
  try {
    await fs.access(verificationPath);
  } catch {
    return [{
      code: 'missing-verification',
      level,
      message: 'evals/verification.json is missing',
    }];
  }
  let verification: EvalVerification;
  try {
    verification = verificationSchema.parse(JSON.parse(
      await fs.readFile(verificationPath, 'utf8'),
    ));
  } catch (error) {
    return [{
      code: 'invalid-verification',
      level,
      message: error instanceof Error ? error.message : String(error),
    }];
  }
  const issues: SkillEvalIssue[] = [];
  if (verification.skill_version !== await skillVersion(skillDir)) {
    issues.push({
      code: 'stale-skill-version',
      level,
      message: 'verification does not match the current skill version',
    });
  }
  if (verification.status !== 'passed' || verification.passed !== verification.total) {
    issues.push({
      code: 'failed-verification',
      level,
      message: `eval verification passed ${verification.passed}/${verification.total}`,
    });
  }
  if (verification.evals_digest !== await computeEvalDigest(skillDir)) {
    issues.push({
      code: 'stale-evals-digest',
      level,
      message: 'verification does not match the current eval definition',
    });
  }
  const currentDigest = await computeSkillDigest(skillDir);
  if (verification.skill_digest !== currentDigest) {
    issues.push({
      code: 'stale-skill-digest',
      level,
      message: 'verification does not match the current skill behavior',
    });
  }
  return issues;
};

const EXCLUDED_TREES = ['.system', 'third-party', 'third_party', 'vendor', 'archive'];

const discoverSkillDirs = async (root: string, relative = ''): Promise<string[]> => {
  const segments = relative.split(path.sep);
  if (segments.some((segment) => EXCLUDED_TREES.includes(segment))) {
    return [];
  }
  const absolute = path.join(root, relative);
  const entries = await fs.readdir(absolute, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) return [relative];

  const skills: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      skills.push(...await discoverSkillDirs(root, path.join(relative, entry.name)));
    }
  }
  return skills;
};

/**
 * Skill directories installed from an upstream source, read from the registry's
 * `skills-lock.json`. Lock entries record a `skillPath` relative to the installing
 * tool's root, so a discovered skill is vendored when its path ends with that entry.
 */
const readVendoredSkillDirs = async (root: string): Promise<string[]> => {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(root, 'skills-lock.json'), 'utf8');
  } catch {
    return [];
  }
  try {
    const lock = JSON.parse(raw) as { skills?: Record<string, { skillPath?: unknown }> };
    return Object.values(lock.skills ?? {})
      .map((entry) => entry?.skillPath)
      .filter((skillPath): skillPath is string => typeof skillPath === 'string' && skillPath !== '')
      .map((skillPath) => path.dirname(skillPath.split('/').join(path.sep)));
  } catch {
    return [];
  }
};

const isVendoredSkill = (skill: string, vendoredDirs: string[]): boolean =>
  vendoredDirs.some((dir) => skill === dir || skill.endsWith(`${path.sep}${dir}`));

/** Whether a changed path touches behavior the skill digest actually covers. */
const changesSkillBehavior = (changedPath: string, skill: string): boolean => {
  if (changedPath === skill) return true;
  const prefix = `${skill}${path.sep}`;
  if (!changedPath.startsWith(prefix)) return false;
  return isBehaviorPath(changedPath.slice(prefix.length));
};

/** Audits every self-maintained skill, enforcing eval verification only for changed paths. */
export const auditSkillRegistry = async (
  root: string,
  options: { changedPaths: string[]; enforceAll?: boolean },
): Promise<SkillEvalRegistryReport> => {
  const issues: RegistrySkillEvalIssue[] = [];
  const vendoredDirs = await readVendoredSkillDirs(root);
  for (const skill of await discoverSkillDirs(root)) {
    if (isVendoredSkill(skill, vendoredDirs)) continue;
    const enforce = options.enforceAll || options.changedPaths.some(
      (changedPath) => changesSkillBehavior(changedPath, skill),
    );
    const skillIssues = await auditSkillEval(path.join(root, skill), { enforce });
    issues.push(...skillIssues.map((issue) => ({ ...issue, skill })));
  }
  return {
    passed: !issues.some((issue) => issue.level === 'error'),
    issues,
  };
};

/** Returns Git-tracked and untracked paths relative to a registry directory. */
export const collectGitChangedPaths = async (
  registryDir: string,
  baselineRef: string,
): Promise<string[]> => {
  const resolvedRegistry = await fs.realpath(registryDir);
  let gitRoot: string;
  try {
    gitRoot = (await execFile('git', ['-C', resolvedRegistry, 'rev-parse', '--show-toplevel'])).stdout.trim();
  } catch {
    return [];
  }
  const registryPrefix = path.relative(gitRoot, resolvedRegistry);
  const pathspec = registryPrefix || '.';
  const outputs: string[] = [];
  try {
    outputs.push((await execFile(
      'git', ['-C', gitRoot, 'diff', '--name-only', baselineRef, '--', pathspec],
    )).stdout);
  } catch {
    outputs.push((await execFile(
      'git', ['-C', gitRoot, 'diff', '--name-only', 'HEAD', '--', pathspec],
    )).stdout);
  }
  outputs.push((await execFile(
    'git', ['-C', gitRoot, 'ls-files', '--others', '--exclude-standard', '--', pathspec],
  )).stdout);

  const prefix = registryPrefix ? `${registryPrefix}${path.sep}` : '';
  return [...new Set(outputs
    .flatMap((output) => output.split(/\r?\n/))
    .filter(Boolean)
    .map((file) => prefix && file.startsWith(prefix) ? file.slice(prefix.length) : file)
    .filter((file) => !prefix || !file.startsWith('..')))]
    .sort();
};
