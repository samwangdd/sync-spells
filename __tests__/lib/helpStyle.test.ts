import { afterEach, describe, expect, it } from '@jest/globals';
import { Command } from 'commander';
import { configureColorfulHelp } from '../../src/lib/helpStyle';

describe('configureColorfulHelp', () => {
  const originalForceColor = process.env.FORCE_COLOR;
  const originalNoColor = process.env.NO_COLOR;

  afterEach(() => {
    if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = originalForceColor;
    if (originalNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = originalNoColor;
  });

  it('adds ANSI styles to help headings, commands, arguments, and options when color is enabled', () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    const program = new Command('spells').description('Manage spells');
    program.command('web [name]').option('--port <n>', 'Preferred port');

    configureColorfulHelp(program);

    expect(program.helpInformation()).toMatch(/\u001b\[/);
  });
});
