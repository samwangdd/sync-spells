import { Command } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, readConfig } from '../lib/config';
import { SkillCatalogService } from '../web/SkillCatalogService';
import { ProfileWriter } from '../web/ProfileWriter';
import { ApiDeps, createServer, startServer } from '../web/server';
import * as http from 'http';

export interface WebHandle {
  getState: ApiDeps['getState'];
  createServer: (distDir: string) => http.Server;
}

export const runWeb = (config: Config): WebHandle => {
  const catalog = new SkillCatalogService(config);
  const writer = new ProfileWriter(config);
  const deps: ApiDeps = {
    getState: () => catalog.getState(),
    writeProfile: (name, body) => writer.write(name, body),
    readMarkdown: async (ref) => {
      const safeRef = ref.replace(/\.\.+/g, '');
      return fs.readFile(path.join(config.source, safeRef, 'SKILL.md'), 'utf8');
    },
  };
  return { getState: deps.getState, createServer: (distDir: string) => createServer(deps, distDir) };
};

const openBrowser = (url: string): void => {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
};

export const registerWeb = (program: Command, getConfig: () => Promise<Config> = readConfig): void => {
  program
    .command('web')
    .description('Launch the local skill profile web UI')
    .option('--port <n>', 'preferred port', '4178')
    .option('--no-open', 'do not open the browser automatically')
    .action(async (opts: { port: string; open: boolean }) => {
      const config = await getConfig();
      const distDir = path.join(__dirname, '..', '..', 'webui', 'dist');
      try {
        await fs.access(path.join(distDir, 'index.html'));
      } catch {
        console.error('\nweb UI is not built yet. Run:\n  npm run web:build\n');
        process.exit(1);
      }
      const handle = runWeb(config);
      const server = handle.createServer(distDir);
      const port = await startServer(server, Number(opts.port) || 4178);
      const url = `http://localhost:${port}`;
      console.log(`\nspells web running at ${url}\n`);
      if (opts.open) openBrowser(url);
    });
};
