import { spawn } from 'child_process';
import * as path from 'path';
import { Command } from 'commander';
import { Config } from '../lib/config';
import {
  auditSkillRegistry,
  collectGitChangedPaths,
  EvalAgentInput,
  runSkillEval,
} from '../lib/skillEvals';

/** Runs one eval-agent executable with a single JSON document on stdin/stdout. */
export const runExecutableEvalAgent = async (
  executable: string,
  input: EvalAgentInput,
): Promise<unknown> => new Promise((resolve, reject) => {
  const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code !== 0) {
      reject(new Error(`eval runner exited ${code}: ${stderr.trim()}`));
      return;
    }
    try {
      resolve(JSON.parse(stdout));
    } catch {
      reject(new Error('eval runner must emit one JSON document on stdout'));
    }
  });
  child.stdin.end(JSON.stringify(input));
});

export const registerSkillEvals = (
  skillCommand: Command,
  getConfig: () => Promise<Config>,
): void => {
  const evalCommand = skillCommand
    .command('eval')
    .description('Run and audit skill eval suites');

  evalCommand
    .command('audit [path]')
    .option('--baseline-ref <ref>', 'Git baseline used to detect changed skills', 'HEAD^')
    .description('Audit eval suites and verification digests')
    .action(async (target: string | undefined, options: { baselineRef: string }) => {
      const config = await getConfig();
      const registry = path.resolve(target ?? config.source);
      const changedPaths = await collectGitChangedPaths(registry, options.baselineRef);
      const report = await auditSkillRegistry(registry, { changedPaths });
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) throw new Error('Skill eval audit failed');
    });

  evalCommand
    .command('run <skill>')
    .requiredOption('--runner <executable>', 'Executable that accepts and returns one JSON document')
    .requiredOption('--baseline-ref <ref>', 'Baseline revision recorded in verification')
    .option('--baseline-dir <path>', 'Materialized baseline skill directory')
    .option('--workspace <path>', 'External workspace root for detailed run artifacts')
    .description('Run baseline and current evals, then write verification')
    .action(async (skill: string, options: {
      runner: string;
      baselineRef: string;
      baselineDir?: string;
      workspace?: string;
    }) => {
      const config = await getConfig();
      const skillDir = path.resolve(config.source, skill);
      const verification = await runSkillEval({
        skillDir,
        baselineDir: options.baselineDir ? path.resolve(options.baselineDir) : null,
        baselineRef: options.baselineRef,
        workspaceRoot: options.workspace ? path.resolve(options.workspace) : undefined,
        runner: (input) => runExecutableEvalAgent(options.runner, input),
      });
      console.log(JSON.stringify(verification, null, 2));
      if (verification.status !== 'passed') throw new Error('Skill eval run failed');
    });
};
