import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  SERVICE_LABEL,
  buildPlist,
  parseLaunchctlPrint,
  parsePlistArgs,
  plistPath,
  logPaths,
  resolveNodePath,
  runServiceInstall,
  runServiceStatus,
  runServiceUninstall,
  ServiceDeps,
} from '../../src/commands/service';

interface Call { cmd: string; args: string[] }

const fakeExec = (
  calls: Call[],
  results: Record<string, { code: number; stdout?: string; stderr?: string }> = {},
) => async (cmd: string, args: string[]) => {
  calls.push({ cmd, args });
  const key = [cmd, ...args].join(' ');
  const match = Object.keys(results).find((k) => key.includes(k));
  const r = match ? results[match] : { code: 0 };
  return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

describe('buildPlist', () => {
  const opts = {
    label: SERVICE_LABEL,
    nodePath: '/opt/homebrew/bin/node',
    repoRoot: '/Users/me/codeLab/sync-spells',
    homeDir: '/Users/me',
    port: 4178,
    host: '127.0.0.1',
  };

  it('runs the CLI entry point through an absolute node path with service-safe flags', () => {
    const xml = buildPlist(opts);
    expect(parsePlistArgs(xml)).toEqual([
      '/opt/homebrew/bin/node',
      '/Users/me/codeLab/sync-spells/bin/spells.js',
      'web',
      '--no-open',
      '--strict-port',
      '--port', '4178',
      '--host', '127.0.0.1',
    ]);
  });

  it('starts at login and is relaunched only after a non-zero exit', () => {
    const xml = buildPlist(opts);
    expect(xml).toContain('<key>RunAtLoad</key>\n  <true/>');
    // KeepAlive={SuccessfulExit:false}: crash -> relaunch, graceful exit(0) -> stay down
    expect(xml).toMatch(/<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<\/dict>/);
    expect(xml).toContain('<key>ThrottleInterval</key>\n  <integer>10</integer>');
  });

  it('redirects both streams into the sync-spells log dir', () => {
    const xml = buildPlist(opts);
    expect(xml).toContain('<string>/Users/me/.sync-spells/logs/web.out.log</string>');
    expect(xml).toContain('<string>/Users/me/.sync-spells/logs/web.err.log</string>');
  });

  it('gives launchd an explicit PATH containing the resolved node dir', () => {
    const xml = buildPlist(opts);
    expect(xml).toMatch(/<key>PATH<\/key>\s*<string>\/opt\/homebrew\/bin:/);
  });

  it('escapes XML-significant characters in paths', () => {
    const xml = buildPlist({ ...opts, repoRoot: '/Users/me/a&b<c>' });
    expect(xml).toContain('/Users/me/a&amp;b&lt;c&gt;/bin/spells.js');
    expect(xml).not.toContain('a&b<c>');
  });
});

describe('resolveNodePath', () => {
  it('prefers an explicit --node override', () => {
    const r = resolveNodePath({ explicit: '/custom/node', exists: () => true, execPath: '/nvm/node' });
    expect(r.nodePath).toBe('/custom/node');
    expect(r.warning).toBeUndefined();
  });

  it('rejects an explicit override that does not exist', () => {
    expect(() => resolveNodePath({ explicit: '/gone/node', exists: () => false, execPath: '/nvm/node' }))
      .toThrow(/\/gone\/node/);
  });

  it('prefers a stable homebrew node over the nvm-versioned node currently running', () => {
    const r = resolveNodePath({
      exists: (p) => p === '/opt/homebrew/bin/node',
      execPath: '/Users/me/.nvm/versions/node/v22.22.0/bin/node',
    });
    expect(r.nodePath).toBe('/opt/homebrew/bin/node');
    expect(r.warning).toBeUndefined();
  });

  it('falls back to /usr/local/bin/node when homebrew node is absent', () => {
    const r = resolveNodePath({
      exists: (p) => p === '/usr/local/bin/node',
      execPath: '/Users/me/.nvm/versions/node/v22.22.0/bin/node',
    });
    expect(r.nodePath).toBe('/usr/local/bin/node');
  });

  it('warns when it can only fall back to a version-managed node path', () => {
    const r = resolveNodePath({
      exists: () => false,
      execPath: '/Users/me/.nvm/versions/node/v22.22.0/bin/node',
    });
    expect(r.nodePath).toBe('/Users/me/.nvm/versions/node/v22.22.0/bin/node');
    expect(r.warning).toMatch(/nvm|version/i);
  });
});

describe('parseLaunchctlPrint', () => {
  it('extracts state, pid and last exit code', () => {
    const out = [
      'com.sync-spells.web = {',
      '\tactive count = 1',
      '\tstate = running',
      '\tpid = 54321',
      '\tlast exit code = 0',
      '}',
    ].join('\n');
    expect(parseLaunchctlPrint(out)).toEqual({ state: 'running', pid: 54321, lastExitCode: 0 });
  });

  it('handles a loaded-but-stopped job', () => {
    const out = '\tstate = not running\n\tlast exit code = 1\n';
    expect(parseLaunchctlPrint(out)).toEqual({ state: 'not running', pid: undefined, lastExitCode: 1 });
  });
});

describe('service install / status / uninstall', () => {
  let home: string;
  let repo: string;
  let calls: Call[];
  let deps: ServiceDeps;

  const makeRepo = async (withDist: boolean) => {
    await fs.mkdir(path.join(repo, 'bin'), { recursive: true });
    await fs.writeFile(path.join(repo, 'bin', 'spells.js'), '#!/usr/bin/env node\n');
    if (withDist) {
      await fs.mkdir(path.join(repo, 'webui', 'dist'), { recursive: true });
      await fs.writeFile(path.join(repo, 'webui', 'dist', 'index.html'), '<html></html>');
    }
  };

  beforeEach(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spells-service-'));
    home = path.join(root, 'home');
    repo = path.join(root, 'repo');
    await fs.mkdir(home, { recursive: true });
    calls = [];
    deps = { exec: fakeExec(calls), homeDir: home, repoRoot: repo, uid: 501 };
  });

  afterEach(async () => {
    await fs.rm(path.dirname(home), { recursive: true, force: true });
  });

  it('refuses to install when the web UI has not been built, without touching launchctl', async () => {
    await makeRepo(false);

    await expect(runServiceInstall(deps, { nodePath: '/opt/homebrew/bin/node' }))
      .rejects.toThrow(/web:build/);
    expect(calls).toHaveLength(0);
    await expect(fs.access(plistPath(home))).rejects.toThrow();
  });

  it('writes the plist, creates the log dir, then bootout -> enable -> bootstrap', async () => {
    await makeRepo(true);

    const result = await runServiceInstall(deps, { nodePath: '/opt/homebrew/bin/node' });

    const xml = await fs.readFile(plistPath(home), 'utf8');
    expect(parsePlistArgs(xml)[1]).toBe(path.join(repo, 'bin', 'spells.js'));
    await expect(fs.access(path.dirname(logPaths(home).out))).resolves.toBeUndefined();

    expect(calls.map((c) => `${c.cmd} ${c.args[0]}`)).toEqual([
      'launchctl bootout',
      'launchctl enable',
      'launchctl bootstrap',
    ]);
    // enable must precede bootstrap, or bootstrap fails on a disabled label
    expect(calls[1].args[1]).toBe(`gui/501/${SERVICE_LABEL}`);
    expect(calls[2].args).toEqual(['bootstrap', 'gui/501', plistPath(home)]);
    expect(result.plistPath).toBe(plistPath(home));
    expect(result.port).toBe(4178);
  });

  it('warns when a foreign listener already holds the port after our own job is booted out', async () => {
    await makeRepo(true);
    // A stray `spells web` bound to 0.0.0.0 coexists with our 127.0.0.1 bind under BSD socket
    // semantics, so --strict-port cannot see it. Only an explicit probe can.
    const result = await runServiceInstall(
      { ...deps, probe: async () => true },
      { nodePath: '/opt/homebrew/bin/node' },
    );

    expect(result.warnings.join('\n')).toMatch(/already listening on 127\.0\.0\.1:4178/);
    // probing must happen after bootout, or reinstalling over our own agent warns spuriously
    const probeIndex = calls.findIndex((c) => c.args[0] === 'bootout');
    expect(probeIndex).toBe(0);
  });

  it('does not warn about the port when nothing else is listening', async () => {
    await makeRepo(true);
    const result = await runServiceInstall(
      { ...deps, probe: async () => false },
      { nodePath: '/opt/homebrew/bin/node' },
    );
    expect(result.warnings.join('\n')).not.toMatch(/already listening/);
  });

  it('tolerates a bootout failure on first install but fails loudly if bootstrap fails', async () => {
    await makeRepo(true);
    const failing = {
      ...deps,
      exec: fakeExec(calls, {
        bootout: { code: 3, stderr: 'No such process' },
        bootstrap: { code: 5, stderr: 'Service is disabled' },
      }),
    };

    await expect(runServiceInstall(failing, { nodePath: '/opt/homebrew/bin/node' }))
      .rejects.toThrow(/Service is disabled/);
  });

  it('reports running state and flags a node path that no longer exists', async () => {
    await makeRepo(true);
    await runServiceInstall(deps, { nodePath: '/gone/node', skipNodeCheck: true });
    calls.length = 0;

    const status = await runServiceStatus({
      ...deps,
      exec: fakeExec(calls, { print: { code: 0, stdout: '\tstate = running\n\tpid = 999\n' } }),
    });

    expect(status.installed).toBe(true);
    expect(status.running).toBe(true);
    expect(status.pid).toBe(999);
    expect(status.nodePath).toBe('/gone/node');
    expect(status.nodePathValid).toBe(false);
    expect(status.url).toBe('http://127.0.0.1:4178');
  });

  it('reports not-installed when no plist is present', async () => {
    const status = await runServiceStatus(deps);
    expect(status.installed).toBe(false);
    expect(status.running).toBe(false);
  });

  it('boots the job out and deletes the plist on uninstall', async () => {
    await makeRepo(true);
    await runServiceInstall(deps, { nodePath: '/opt/homebrew/bin/node' });
    calls.length = 0;

    const result = await runServiceUninstall(deps);

    expect(result.removed).toBe(true);
    expect(calls[0].args).toEqual(['bootout', `gui/501/${SERVICE_LABEL}`]);
    await expect(fs.access(plistPath(home))).rejects.toThrow();
  });

  it('is a no-op uninstall when nothing is installed', async () => {
    const result = await runServiceUninstall(deps);
    expect(result.removed).toBe(false);
  });
});
