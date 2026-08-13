import { Command } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, readConfig } from '../lib/config';
import { SkillCatalogService } from '../web/SkillCatalogService';
import { ProfileWriter } from '../web/ProfileWriter';
import { ApiDeps, DEFAULT_HOST, createServer, startServer } from '../web/server';
import * as http from 'http';

export const resolveWithin = (base: string, ref: string): string => {
  const resolved = path.resolve(base, ref);
  const baseResolved = path.resolve(base);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error(`Path traversal detected: ${ref}`);
  }
  return resolved;
};

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
      const skillDir = resolveWithin(config.source, ref);
      return fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    },
    removeSkillFromCategory: (category, skill) => catalog.removeSkillFromCategory(category, skill),
    moveSkillToCategory: (category, skill, targetCategory) => catalog.moveSkillToCategory(category, skill, targetCategory),
    createCategory: (name) => catalog.createCategory(name),
  };
  return { getState: deps.getState, createServer: (distDir: string) => createServer(deps, distDir) };
};

/**
 * Under launchd, stopping the job sends SIGTERM. Without a handler the process is torn down
 * mid-request; with one we drain and exit 0, which the agent's KeepAlive={SuccessfulExit:false}
 * reads as "stopped on purpose" and therefore does not relaunch.
 */
export const installShutdownHandlers = (
  server: http.Server,
  exit: (code: number) => void = (c) => process.exit(c),
  graceMs = 5000,
): void => {
  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`\nspells web: ${signal} received, shutting down`);
    // Keep-alive connections would otherwise hold close() open past launchd's kill timeout.
    const timer = setTimeout(() => exit(0), graceMs);
    timer.unref?.();
    server.closeAllConnections?.();
    server.close(() => {
      clearTimeout(timer);
      exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
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
    .option('--host <addr>', 'interface to bind (use 0.0.0.0 to expose on the LAN)', DEFAULT_HOST)
    .option('--strict-port', 'fail instead of trying the next free port')
    .option('--no-open', 'do not open the browser automatically')
    .action(async (opts: { port: string; host: string; strictPort?: boolean; open: boolean }) => {
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
      const preferred = Number(opts.port) || 4178;
      let port: number;
      try {
        port = await startServer(server, preferred, {
          host: opts.host,
          maxAttempts: opts.strictPort ? 0 : 10,
        });
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        console.error(
          code === 'EADDRINUSE'
            ? `\nspells web: port ${preferred} is already in use\n`
            : `\nspells web: failed to listen: ${e instanceof Error ? e.message : String(e)}\n`,
        );
        process.exit(1);
        return;
      }
      installShutdownHandlers(server);
      const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${port}`;
      console.log(`\nspells web running at ${url}\n`);
      if (opts.open) openBrowser(url);
    });
};
