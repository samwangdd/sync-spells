import { Command } from 'commander';
import * as path from 'path';
import { Config } from '../lib/config';
import { SkillService } from '../services/SkillService';
import { registerSkillEvals } from './skill-evals';

export const registerSkill = (program: Command, getConfig: () => Promise<Config>): void => {
  const skillCmd = program.command('skill').description(
    'Manage skills in the Library\n' +
    '  add <path>          Add existing skill to Library\n' +
    '  new <name>          Create new skill skeleton\n' +
    '  list                List skills in Library\n' +
    '  globalize <skill>   Move a skill into global\n' +
    '  localize <skill>    Move a global skill into a local category'
  );

  registerSkillEvals(skillCmd, getConfig);

  skillCmd
    .command('add <path>')
    .option('--category <cat>', 'Category (global/knowledge/coding/workflow)', 'knowledge')
    .option('--target <path>', 'Target path in registry')
    .description('Add existing skill to registry')
    .action(async (sourcePath: string, options: { category: string; target?: string }) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      const targetPath = options.target || path.join(options.category, path.basename(sourcePath));

      try {
        await skillSvc.addSkill(sourcePath, targetPath);
        console.log(`\n✓ Skill added to Library: ${targetPath}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });

  skillCmd
    .command('new <name>')
    .option('--category <cat>', 'Category (global/knowledge/coding/workflow)', 'knowledge')
    .description('Create new skill skeleton')
    .action(async (name: string, options: { category: string }) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      try {
        const skillPath = await skillSvc.createSkill(name, options.category as any);
        console.log(`\n✓ Skill created at: ${skillPath}`);
        console.log(`  Edit SKILL.md to add content\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });

  skillCmd
    .command('list')
    .option('--category <cat>', 'Filter by category')
    .description('List skills in Library')
    .action(async (options: { category?: string }) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      try {
        const skills = await skillSvc.listSkills(options.category as any);

        console.log('\nSkills in Library:');
        for (const skill of skills) {
          const md = skill.hasSkillMd ? '✓' : '✗';
          console.log(`  [${skill.category.padEnd(7)}] ${skill.name} ${md}`);
        }
        console.log(`\nTotal: ${skills.length} skills\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });

  skillCmd
    .command('globalize <skill>')
    .description('Move a skill into global and update profile references')
    .action(async (skill: string) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      try {
        const result = await skillSvc.globalizeSkill(skill);
        console.log(`\n✓ Skill moved to Global: ${result.from} → ${result.to}`);
        if (result.updatedProfiles.length > 0) {
          console.log(`  Updated ${result.updatedProfiles.length} profile file(s)\n`);
        } else {
          console.log('  No profile references needed updates\n');
        }
      } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  skillCmd
    .command('localize <skill>')
    .requiredOption('--to <category>', 'Target category (knowledge/coding/workflow)')
    .description('Move a global skill into a local category and update profile references')
    .action(async (skill: string, options: { to: string }) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      try {
        const result = await skillSvc.localizeSkill(skill, options.to as any);
        console.log(`\n✓ Skill moved out of Global: ${result.from} → ${result.to}`);
        if (result.updatedProfiles.length > 0) {
          console.log(`  Updated ${result.updatedProfiles.length} profile file(s)\n`);
        } else {
          console.log('  No profile references needed updates\n');
        }
      } catch (error) {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });
};
