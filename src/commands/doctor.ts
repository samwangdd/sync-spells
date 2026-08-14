import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { auditSkillRegistry, collectGitChangedPaths } from '../lib/skillEvals';

export interface DoctorResult {
  check: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export const runDoctor = async (config: Config): Promise<DoctorResult[]> => {
  const results: DoctorResult[] = [];

  // Check config
  try {
    const configPath = path.join(os.homedir(), '.sync-spells', 'config.json');
    await fs.access(configPath);
    results.push({ check: 'config', status: 'ok', message: 'Config file found' });
  } catch {
    results.push({ check: 'config', status: 'error', message: 'Config file not found (run "spells setup")' });
  }

  // Check registry
  try {
    await fs.access(config.source);
    results.push({ check: 'registry', status: 'ok', message: `Registry directory exists: ${config.source}` });
  } catch {
    results.push({ check: 'registry', status: 'error', message: `Registry directory not found: ${config.source}` });
  }

  const changedPaths = await collectGitChangedPaths(config.source, 'HEAD^').catch(() => []);
  const evalReport = await auditSkillRegistry(config.source, { changedPaths });
  const evalErrors = evalReport.issues.filter((issue) => issue.level === 'error').length;
  const evalWarnings = evalReport.issues.filter((issue) => issue.level === 'warning').length;
  results.push({
    check: 'skill-evals',
    status: evalErrors > 0 ? 'error' : evalWarnings > 0 ? 'warn' : 'ok',
    message: evalErrors > 0
      ? `Skill evals: ${evalErrors} error(s), ${evalWarnings} warning(s)`
      : `Skill evals: ${evalWarnings} warning(s)`,
  });

  // Check profiles
  const profileSvc = new ProfileService(config);
  const profiles = await profileSvc.listProfiles();

  if (profiles.length === 0) {
    results.push({ check: 'profiles', status: 'warn', message: 'No profiles found' });
  } else {
    let allValid = true;
    for (const profile of profiles) {
      const validation = await profileSvc.validateProfile(profile);
      if (!validation.valid) allValid = false;
    }
    results.push({
      check: 'profiles',
      status: allValid ? 'ok' : 'warn',
      message: `${profiles.length} profiles found`
    });
  }

  return results;
};

export const registerDoctor = (program: Command, getConfig: () => Promise<Config>): void => {
  program
    .command('doctor')
    .description('Run health check on SyncSpells installation')
    .action(async () => {
      const config = await getConfig();

      console.log('\nChecking SyncSpells installation...\n');

      const results = await runDoctor(config);

      for (const result of results) {
        const icon = result.status === 'ok' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
        console.log(`  ${icon} ${result.message}`);
      }

      const hasErrors = results.some(r => r.status === 'error');
      console.log(`\n${hasErrors ? '✗ Issues found' : '✓ Health check complete'}\n`);
    });
};
