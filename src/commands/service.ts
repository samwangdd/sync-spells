import { Command } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

export const SERVICE_LABEL = 'com.sync-spells.web';
export const DEFAULT_PORT = 4178;
export const DEFAULT_HOST = '127.0.0.1';

/** launchd throttles relaunches to this many seconds, so a crash loop cannot spin the CPU. */
const THROTTLE_SECONDS = 10;

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ServiceDeps {
  exec: (cmd: string, args: string[]) => Promise<ExecResult>;
  homeDir: string;
  repoRoot: string;
  uid: number;
  /** Returns true if something already accepts connections on host:port. */
  probe?: (host: string, port: number) => Promise<boolean>;
}

export interface PlistOptions {
  label: string;
  nodePath: string;
  repoRoot: string;
  homeDir: string;
  port: number;
  host: string;
}

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

export const plistPath = (homeDir: string): string =>
  path.join(homeDir, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);

export const logPaths = (homeDir: string): { out: string; err: string } => {
  const dir = path.join(homeDir, '.sync-spells', 'logs');
  return { out: path.join(dir, 'web.out.log'), err: path.join(dir, 'web.err.log') };
};

const serviceTarget = (uid: number): string => `gui/${uid}/${SERVICE_LABEL}`;

// ---------------------------------------------------------------------------
// node path resolution
// ---------------------------------------------------------------------------

/**
 * launchd runs with a bare environment, so the plist needs an absolute node path — `/usr/bin/env
 * node` will not resolve. Version managers (nvm, volta, fnm) put the version number *in* the path,
 * so the first `node` on $PATH is usually the one that will vanish on the next upgrade and leave
 * the agent silently failing to relaunch forever. Prefer a stable location when one exists.
 */
const STABLE_NODE_CANDIDATES = ['/opt/homebrew/bin/node', '/usr/local/bin/node'];
const VERSION_MANAGED = /[/.](nvm|volta|fnm|asdf|nodenv|n\/versions)[/.]?/i;

export const resolveNodePath = (opts: {
  explicit?: string;
  exists?: (p: string) => boolean;
  execPath?: string;
} = {}): { nodePath: string; warning?: string } => {
  const exists = opts.exists ?? existsSync;
  const execPath = opts.execPath ?? process.execPath;

  if (opts.explicit) {
    if (!exists(opts.explicit)) throw new Error(`node not found at ${opts.explicit}`);
    return { nodePath: opts.explicit };
  }

  const stable = STABLE_NODE_CANDIDATES.find(exists);
  if (stable) return { nodePath: stable };

  if (VERSION_MANAGED.test(execPath)) {
    return {
      nodePath: execPath,
      warning:
        `using a version-managed node path (${execPath}); upgrading node will break the service. ` +
        'Re-run `spells service install` after any node upgrade, or pass --node <stable path>.',
    };
  }
  return { nodePath: execPath };
};

// ---------------------------------------------------------------------------
// plist
// ---------------------------------------------------------------------------

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const stringArray = (values: string[]): string =>
  values.map((v) => `    <string>${escapeXml(v)}</string>`).join('\n');

export const programArguments = (opts: PlistOptions): string[] => [
  opts.nodePath,
  path.join(opts.repoRoot, 'bin', 'spells.js'),
  'web',
  '--no-open',
  // Without --strict-port a supervised restart that races the old socket would silently land on
  // 4179 and the bookmarked URL would break with no visible error.
  '--strict-port',
  '--port', String(opts.port),
  '--host', opts.host,
];

export const buildPlist = (opts: PlistOptions): string => {
  const logs = logPaths(opts.homeDir);
  const searchPath = [
    path.dirname(opts.nodePath),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin',
  ].filter((p, i, all) => all.indexOf(p) === i).join(':');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(opts.label)}</string>
  <key>ProgramArguments</key>
  <array>
${stringArray(programArguments(opts))}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>${THROTTLE_SECONDS}</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(opts.repoRoot)}</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(logs.out)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(logs.err)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(searchPath)}</string>
  </dict>
</dict>
</plist>
`;
};

const unescapeXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Reads ProgramArguments back out of an installed plist — used by `status` and by the tests. */
export const parsePlistArgs = (xml: string): string[] => {
  const block = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!block) return [];
  return [...block[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => unescapeXml(m[1]));
};

const argValue = (args: string[], flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

// ---------------------------------------------------------------------------
// launchctl
// ---------------------------------------------------------------------------

export interface LaunchctlState {
  state?: string;
  pid?: number;
  lastExitCode?: number;
}

export const parseLaunchctlPrint = (stdout: string): LaunchctlState => {
  const state = stdout.match(/^\s*state = (.+)$/m)?.[1].trim();
  const pid = stdout.match(/^\s*pid = (\d+)$/m)?.[1];
  const exit = stdout.match(/^\s*last exit code = (-?\d+)$/m)?.[1];
  return {
    state,
    pid: pid ? Number(pid) : undefined,
    lastExitCode: exit ? Number(exit) : undefined,
  };
};

export const execCommand = (cmd: string, args: string[]): Promise<ExecResult> =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', (e) => resolve({ code: 127, stdout, stderr: e.message }));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });

/**
 * `spells web --strict-port` cannot detect every conflict: under BSD socket semantics a bind to
 * 127.0.0.1 succeeds even while another process holds the 0.0.0.0/:: wildcard on the same port
 * (as a stray `spells web` from a terminal does). Such a process silently keeps answering LAN
 * traffic with stale code, so probe for it explicitly.
 */
export const probePort = (host: string, port: number, timeoutMs = 400): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open: boolean) => { socket.destroy(); resolve(open); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });

export const defaultDeps = (): ServiceDeps => ({
  exec: execCommand,
  homeDir: os.homedir(),
  repoRoot: path.join(__dirname, '..', '..'),
  uid: process.getuid?.() ?? 501,
  probe: probePort,
});

// ---------------------------------------------------------------------------
// install / status / uninstall
// ---------------------------------------------------------------------------

export interface InstallOptions {
  port?: number;
  host?: string;
  nodePath?: string;
  /** Skip the existence check on an explicit node path (tests only). */
  skipNodeCheck?: boolean;
}

export interface InstallResult {
  label: string;
  plistPath: string;
  nodePath: string;
  port: number;
  host: string;
  url: string;
  logPaths: { out: string; err: string };
  warnings: string[];
}

export const runServiceInstall = async (
  deps: ServiceDeps,
  opts: InstallOptions = {},
): Promise<InstallResult> => {
  const port = opts.port ?? DEFAULT_PORT;
  const host = opts.host ?? DEFAULT_HOST;

  // webui/dist is gitignored. Installing without it would give launchd a job that exits 1 every
  // THROTTLE_SECONDS forever, so refuse up front rather than write a self-flapping agent.
  const indexHtml = path.join(deps.repoRoot, 'webui', 'dist', 'index.html');
  try {
    await fs.access(indexHtml);
  } catch {
    throw new Error('web UI is not built yet. Run:\n  npm run web:build');
  }

  const entry = path.join(deps.repoRoot, 'bin', 'spells.js');
  try {
    await fs.access(entry);
  } catch {
    throw new Error(`CLI entry point not found at ${entry}`);
  }

  const warnings: string[] = [];
  let nodePath: string;
  if (opts.skipNodeCheck && opts.nodePath) {
    nodePath = opts.nodePath;
  } else {
    const resolved = resolveNodePath({ explicit: opts.nodePath });
    nodePath = resolved.nodePath;
    if (resolved.warning) warnings.push(resolved.warning);
  }

  const target = plistPath(deps.homeDir);
  const logs = logPaths(deps.homeDir);
  await fs.mkdir(path.dirname(logs.out), { recursive: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    target,
    buildPlist({ label: SERVICE_LABEL, nodePath, repoRoot: deps.repoRoot, homeDir: deps.homeDir, port, host }),
    'utf8',
  );

  // Idempotent reinstall: an already-loaded job would make bootstrap fail with EEXIST.
  await deps.exec('launchctl', ['bootout', serviceTarget(deps.uid)]);

  // Probe only after our own job is down, so a reinstall does not warn about itself.
  if (deps.probe && (await deps.probe(host, port))) {
    warnings.push(
      `something is already listening on ${host}:${port} — probably a stray \`spells web\`. ` +
      `It will keep serving stale code alongside the service; find it with ` +
      `\`lsof -nP -iTCP:${port} -sTCP:LISTEN\`.`,
    );
  }

  // `enable` must precede `bootstrap`: bootstrap refuses a label sitting in the disabled database.
  await deps.exec('launchctl', ['enable', serviceTarget(deps.uid)]);
  const boot = await deps.exec('launchctl', ['bootstrap', `gui/${deps.uid}`, target]);
  if (boot.code !== 0) {
    throw new Error(`launchctl bootstrap failed (exit ${boot.code}): ${boot.stderr.trim() || boot.stdout.trim()}`);
  }

  return {
    label: SERVICE_LABEL,
    plistPath: target,
    nodePath,
    port,
    host,
    url: `http://${host}:${port}`,
    logPaths: logs,
    warnings,
  };
};

export interface StatusResult {
  installed: boolean;
  running: boolean;
  pid?: number;
  lastExitCode?: number;
  state?: string;
  nodePath?: string;
  nodePathValid: boolean;
  port?: number;
  host?: string;
  url?: string;
  plistPath: string;
  logPaths: { out: string; err: string };
}

export const runServiceStatus = async (deps: ServiceDeps): Promise<StatusResult> => {
  const target = plistPath(deps.homeDir);
  const logs = logPaths(deps.homeDir);

  let xml: string | undefined;
  try {
    xml = await fs.readFile(target, 'utf8');
  } catch {
    return { installed: false, running: false, nodePathValid: false, plistPath: target, logPaths: logs };
  }

  const args = parsePlistArgs(xml);
  const nodePath = args[0];
  const port = Number(argValue(args, '--port') ?? DEFAULT_PORT);
  const host = argValue(args, '--host') ?? DEFAULT_HOST;

  const printed = await deps.exec('launchctl', ['print', serviceTarget(deps.uid)]);
  const parsed = printed.code === 0 ? parseLaunchctlPrint(printed.stdout) : {};

  return {
    installed: true,
    running: parsed.state === 'running',
    pid: parsed.pid,
    lastExitCode: parsed.lastExitCode,
    state: parsed.state,
    nodePath,
    nodePathValid: Boolean(nodePath) && existsSync(nodePath),
    port,
    host,
    url: `http://${host}:${port}`,
    plistPath: target,
    logPaths: logs,
  };
};

export const runServiceUninstall = async (deps: ServiceDeps): Promise<{ removed: boolean; plistPath: string }> => {
  const target = plistPath(deps.homeDir);
  try {
    await fs.access(target);
  } catch {
    return { removed: false, plistPath: target };
  }
  await deps.exec('launchctl', ['bootout', serviceTarget(deps.uid)]);
  await fs.rm(target, { force: true });
  return { removed: true, plistPath: target };
};

export const runServiceRestart = async (deps: ServiceDeps): Promise<ExecResult> =>
  deps.exec('launchctl', ['kickstart', '-k', serviceTarget(deps.uid)]);

// ---------------------------------------------------------------------------
// CLI wiring
// ---------------------------------------------------------------------------

const fail = (e: unknown): never => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
};

export const registerService = (program: Command, getDeps: () => ServiceDeps = defaultDeps): void => {
  const service = program
    .command('service')
    .description('Run the web UI as a background service that starts at login');

  service
    .command('install')
    .description('Install and start the launchd agent')
    .option('--port <n>', 'port to serve on', String(DEFAULT_PORT))
    .option('--host <addr>', 'interface to bind', DEFAULT_HOST)
    .option('--node <path>', 'absolute path to the node binary launchd should use')
    .action(async (opts: { port: string; host: string; node?: string }) => {
      try {
        const result = await runServiceInstall(getDeps(), {
          port: Number(opts.port) || DEFAULT_PORT,
          host: opts.host,
          nodePath: opts.node,
        });
        for (const w of result.warnings) console.warn(`warning: ${w}`);
        console.log(`\n${result.label} installed and started`);
        console.log(`  url    ${result.url}`);
        console.log(`  plist  ${result.plistPath}`);
        console.log(`  node   ${result.nodePath}`);
        console.log(`  logs   ${result.logPaths.err}\n`);
      } catch (e) {
        fail(e);
      }
    });

  service
    .command('status')
    .description('Show whether the agent is installed and running')
    .action(async () => {
      const s = await runServiceStatus(getDeps());
      if (!s.installed) {
        console.log('\nnot installed. Run:\n  spells service install\n');
        return;
      }
      console.log(`\n${SERVICE_LABEL}`);
      console.log(`  state  ${s.state ?? 'unknown'}${s.pid ? ` (pid ${s.pid})` : ''}`);
      console.log(`  url    ${s.url}`);
      console.log(`  node   ${s.nodePath}${s.nodePathValid ? '' : '  <- MISSING'}`);
      if (s.lastExitCode !== undefined) console.log(`  exit   ${s.lastExitCode}`);
      console.log(`  logs   ${s.logPaths.err}\n`);
      if (!s.nodePathValid) {
        console.error('the recorded node path no longer exists — re-run `spells service install`\n');
      }
    });

  service
    .command('restart')
    .description('Restart the agent')
    .action(async () => {
      const r = await runServiceRestart(getDeps());
      if (r.code !== 0) fail(new Error(r.stderr.trim() || `launchctl kickstart failed (exit ${r.code})`));
      console.log('\nrestarted\n');
    });

  service
    .command('uninstall')
    .description('Stop the agent and remove the launchd plist')
    .action(async () => {
      const r = await runServiceUninstall(getDeps());
      console.log(r.removed ? `\nremoved ${r.plistPath}\n` : '\nnot installed\n');
    });

  service
    .command('logs')
    .description('Print the service log')
    .option('-f, --follow', 'follow the log')
    .option('--stdout', 'show stdout instead of stderr')
    .action(async (opts: { follow?: boolean; stdout?: boolean }) => {
      const deps = getDeps();
      const logs = logPaths(deps.homeDir);
      const file = opts.stdout ? logs.out : logs.err;
      if (opts.follow) {
        spawn('tail', ['-f', file], { stdio: 'inherit' });
        return;
      }
      try {
        process.stdout.write(await fs.readFile(file, 'utf8'));
      } catch {
        console.log(`\nno log yet at ${file}\n`);
      }
    });
};
