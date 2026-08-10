import { Command } from 'commander';

const hasColors = (): boolean => {
  if (process.env.NO_COLOR || ['0', 'false'].includes(process.env.FORCE_COLOR || '')) {
    return false;
  }
  return Boolean(process.env.FORCE_COLOR || process.env.CLICOLOR_FORCE || process.stdout.isTTY);
};

const style = (code: string, text: string): string => `\u001B[${code}m${text}\u001B[0m`;

export const configureColorfulHelp = (program: Command): void => {
  program.configureOutput({
    getOutHasColors: hasColors,
    getErrHasColors: hasColors,
  });
  program.configureHelp({
    styleTitle: (text) => style('1;36', text),
    styleCommandText: (text) => style('36', text),
    styleSubcommandText: (text) => style('36', text),
    styleOptionText: (text) => style('33', text),
    styleArgumentText: (text) => style('32', text),
  });
};
