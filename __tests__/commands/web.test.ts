import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PassThrough } from 'stream';
import * as http from 'http';
import * as net from 'net';
import { Config } from '../../src/lib/config';
import { runWeb, resolveWithin, installShutdownHandlers } from '../../src/commands/web';

describe('runWeb', () => {
  let dir: string; let cfg: Config;
  beforeEach(async () => {
    dir = path.join('/tmp', `web-${Date.now()}`);
    await fs.mkdir(path.join(dir, 'coding', 'git-commit'), { recursive: true });
    await fs.writeFile(path.join(dir, 'coding', 'git-commit', 'SKILL.md'), `---\nname: git-commit\n---\n`);
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir, 'profiles', 'code.json'),
      JSON.stringify({ name: 'code', categories: ['coding'] }));
    cfg = { source: dir, tools: {}, profilesDir: path.join(dir, 'profiles'), projectBindings: [] };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('assembles dependencies and can build AppState without listening', async () => {
    const handle = runWeb(cfg);
    const state = await handle.getState();
    expect(state.profiles.map((p) => p.name)).toContain('code');
    expect(state.skills.map((s) => s.ref)).toContain('coding/git-commit');
    expect(typeof handle.createServer).toBe('function');
  });

  it('wires the remove skill API through the web server dependencies', async () => {
    const handle = runWeb(cfg);
    const server = handle.createServer('/tmp/nonexistent-dist');
    const listener = server.listeners('request')[0] as (req: any, res: any) => void;
    const response = {
      status: 0,
      body: '',
      writeHead(status: number) { this.status = status; },
      end(body: string) { this.body = body; },
    };

    await listener({ method: 'DELETE', url: '/api/categories/coding/skills/git-commit' }, response);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      removedRef: 'coding/git-commit',
      movedTo: 'inbox/git-commit',
    });
    await expect(fs.access(path.join(dir, 'inbox', 'git-commit', 'SKILL.md'))).resolves.toBeUndefined();
  });

  it('wires the move skill API through the web server dependencies', async () => {
    const handle = runWeb(cfg);
    const server = handle.createServer('/tmp/nonexistent-dist');
    const listener = server.listeners('request')[0] as (req: any, res: any) => void;
    const response = {
      status: 0,
      body: '',
      writeHead(status: number) { this.status = status; },
      end(body: string) { this.body = body; },
    };

    const req = new PassThrough() as any;
    req.method = 'PATCH';
    req.url = '/api/categories/coding/skills/git-commit';
    const handled = listener(req, response);
    req.end(JSON.stringify({ targetCategory: 'workflow' }));
    await handled;

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      removedRef: 'coding/git-commit',
      movedTo: 'workflow/git-commit',
    });
    await expect(fs.access(path.join(dir, 'workflow', 'git-commit', 'SKILL.md'))).resolves.toBeUndefined();
  });
});

describe('installShutdownHandlers', () => {
  const signals = ['SIGTERM', 'SIGINT'] as const;
  afterEach(() => { for (const s of signals) process.removeAllListeners(s); });

  const listen = (server: http.Server) =>
    new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as any).port)));

  it('closes the server and exits 0 so launchd reads it as a deliberate stop', async () => {
    const server = http.createServer();
    await listen(server);
    const codes: number[] = [];
    installShutdownHandlers(server, (c) => codes.push(c));

    process.emit('SIGTERM' as any);
    await new Promise((r) => setTimeout(r, 50));

    expect(codes).toEqual([0]);
    expect(server.listening).toBe(false);
  });

  it('force-exits 0 when an in-flight request holds close() open past the grace period', async () => {
    let hung: http.ServerResponse | undefined;
    // A request that never responds keeps its connection active, so server.close() never
    // completes. Without the grace timer the process would hang until launchd SIGKILLs it.
    const server = http.createServer((_req, res) => { hung = res; });
    const port = await listen(server);

    const socket = net.connect(port, '127.0.0.1');
    socket.on('error', () => { /* reset on purpose during the forced shutdown */ });
    await new Promise((r) => socket.once('connect', r));
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await new Promise((r) => setTimeout(r, 30));
    expect(hung).toBeDefined();

    const codes: number[] = [];
    // closeAllConnections would cut the knot; null it out to exercise the timer itself.
    (server as any).closeAllConnections = undefined;
    installShutdownHandlers(server, (c) => codes.push(c), 30);

    process.emit('SIGTERM' as any);
    await new Promise((r) => setTimeout(r, 120));

    expect(codes[0]).toBe(0);

    hung?.end();
    socket.destroy();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('ignores a second signal instead of exiting twice', async () => {
    const server = http.createServer();
    await listen(server);
    const codes: number[] = [];
    installShutdownHandlers(server, (c) => codes.push(c));

    process.emit('SIGTERM' as any);
    process.emit('SIGINT' as any);
    await new Promise((r) => setTimeout(r, 50));

    expect(codes).toEqual([0]);
  });
});

describe('resolveWithin', () => {
  it('returns resolved path for a safe relative ref', () => {
    const result = resolveWithin('/base', 'coding/git-commit');
    expect(result).toBe(path.resolve('/base', 'coding/git-commit'));
  });

  it('throws on path traversal via ../', () => {
    expect(() => resolveWithin('/base', '../../etc/passwd')).toThrow(/Path traversal/);
  });

  it('throws on absolute ref that escapes base', () => {
    expect(() => resolveWithin('/base', '/etc/passwd')).toThrow(/Path traversal/);
  });

  it('returns the base itself for an empty ref', () => {
    const result = resolveWithin('/base', '');
    expect(result).toBe(path.resolve('/base'));
  });
});
