import { Command } from 'commander';
import * as path from 'path';
import { Config } from '../lib/config';
import { SkillService } from '../services/SkillService';

export const registerSkill = (program: Command, getConfig: () => Promise<Config>): void => {
  const skillCmd = program.command('skill');

  skillCmd
    .command('add <path>')
    .option('--category <cat>', 'Category (global/code/lifeos/inbox)', 'inbox')
    .option('--target <path>', 'Target path in registry')
    .description('Add existing skill to registry')
    .action(async (sourcePath: string, options: { category: string; target?: string }) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      const targetPath = options.target || path.join(options.category, path.basename(sourcePath));

      try {
        await skillSvc.addSkill(sourcePath, targetPath);
        console.log(`\n✓ Skill added to: ${targetPath}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${error}\n`);
        process.exit(1);
      }
    });

  skillCmd
    .command('new <name>')
    .option('--category <cat>', 'Category (global/code/lifeos/inbox)', 'inbox')
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
    .description('List skills in registry')
    .action(async (options: { category?: string }) => {
      const config = await getConfig();
      const skillSvc = new SkillService(config);

      try {
        const skills = await skillSvc.listSkills(options.category as any);

        console.log('\nSkills in registry:');
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
};
