import { describe, expect, it } from '@jest/globals';
import { Command } from 'commander';
import { applyCommandDetailsToDescriptions } from '../../src/lib/commandHelp';

describe('applyCommandDetailsToDescriptions', () => {
  it('adds options and nested subcommands to each command description', () => {
    const program = new Command('spells');
    program.command('status').option('--verbose', 'Show global tool mapping status');
    program.command('use [preset]').option('--profile <name>', 'Specify profile name');
    program.command('migrate').option('--dry-run', 'Preview the migration without changing files');
    program
      .command('web')
      .option('--port <n>', 'Preferred port', '4178')
      .option('--no-open', 'Do not open the browser automatically');
    program.command('skill').command('add <path>').option('--category <cat>', 'Target category');

    applyCommandDetailsToDescriptions(program);

    expect(program.commands.find((command) => command.name() === 'web')?.description())
      .toContain('Preferred port');
    expect(program.commands.find((command) => command.name() === 'status')?.description())
      .toContain('--verbose');
    expect(program.commands.find((command) => command.name() === 'use')?.description())
      .toContain('--profile <name>');
    expect(program.commands.find((command) => command.name() === 'migrate')?.description())
      .toContain('--dry-run');
    expect(program.commands.find((command) => command.name() === 'skill')?.description())
      .toContain('add <path>\n    --category <cat>');
  });
});
