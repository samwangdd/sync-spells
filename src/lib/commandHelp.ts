import { Command } from 'commander';

const commandUsage = (command: Command): string => {
  const usage = command.usage().replace(/\[(?:options|command)\]\s*/g, '').trim();
  return usage ? `${command.name()} ${usage}` : command.name();
};

const baseDescription = (command: Command): string => command.description().split('\n')[0];

const optionLines = (command: Command, indent: string): string[] =>
  command.options
    .filter((option) => option.long !== '--help')
    .map((option) => `${indent}${option.flags.padEnd(22)} ${option.description}`.trimEnd());

const commandLines = (command: Command, indent = '  '): string[] => {
  const lines = [baseDescription(command), ...optionLines(command, indent)];

  for (const subcommand of command.commands) {
    lines.push(`${indent}${commandUsage(subcommand).padEnd(22)} ${baseDescription(subcommand)}`.trimEnd());
    lines.push(...optionLines(subcommand, `${indent}  `));
    for (const nested of subcommand.commands) {
      lines.push(...commandLines(nested, `${indent}  `));
    }
  }

  return lines;
};

export const applyCommandDetailsToDescriptions = (program: Command): void => {
  for (const command of program.commands) {
    command.description(commandLines(command).join('\n'));
  }
};
