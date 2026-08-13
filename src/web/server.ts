import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppState, CategoryView, ProfileView, RemoveSkillResult } from '../shared/contract';

export interface ApiDeps {
  getState: () => Promise<AppState>;
  writeProfile: (name: string, body: unknown) => Promise<ProfileView>;
  readMarkdown: (ref: string) => Promise<string>;
  removeSkillFromCategory: (category: string, skill: string) => Promise<RemoveSkillResult>;
  moveSkillToCategory: (category: string, skill: string, targetCategory: string) => Promise<RemoveSkillResult>;
  createCategory: (name: string) => Promise<CategoryView>;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

/** The API has no authentication, so it must not be reachable off-box by default. */
export const DEFAULT_HOST = '127.0.0.1';

const isValidationError = (e: unknown): boolean =>
  e instanceof Error && e.name === 'ProfileValidationError';

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const startedAt = Date.now();

const createApiDispatcher =
  (deps: ApiDeps) =>
  async (method: string, urlPath: string, body: unknown): Promise<ApiResult> => {
    /**
     * Liveness probe for supervisors (launchd, `spells service status`). Deliberately does not
     * touch the source tree — /api/state scans the whole skill directory, which is far too
     * expensive to poll and would fail on a transient iCloud EPERM.
     */
    if (method === 'GET' && urlPath === '/api/health') {
      return { status: 200, body: { ok: true, uptimeMs: Date.now() - startedAt } };
    }

    if (method === 'GET' && urlPath === '/api/state') {
      return { status: 200, body: await deps.getState() };
    }

    if (method === 'POST' && urlPath === '/api/categories') {
      const name = typeof (body as { name?: unknown } | undefined)?.name === 'string'
        ? (body as { name: string }).name
        : '';
      try {
        return { status: 200, body: await deps.createCategory(name) };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { status: 400, body: { error: message } };
      }
    }

    const putMatch = urlPath.match(/^\/api\/profiles\/([^/]+)$/);
    if (method === 'PUT' && putMatch) {
      const name = decodeURIComponent(putMatch[1]);
      try {
        return { status: 200, body: await deps.writeProfile(name, body) };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { status: isValidationError(e) ? 400 : 500, body: { error: message } };
      }
    }

    const mdMatch = urlPath.match(/^\/api\/skill\/(.+)\/markdown$/);
    if (method === 'GET' && mdMatch) {
      const ref = decodeURIComponent(mdMatch[1]);
      try {
        return { status: 200, body: { markdown: await deps.readMarkdown(ref) } };
      } catch (e) {
        return { status: 404, body: { error: e instanceof Error ? e.message : String(e) } };
      }
    }

    const removeSkillMatch = urlPath.match(/^\/api\/categories\/([^/]+)\/skills\/([^/]+)$/);
    if (method === 'PATCH' && removeSkillMatch) {
      const category = decodeURIComponent(removeSkillMatch[1]);
      const skill = decodeURIComponent(removeSkillMatch[2]);
      const targetCategory = typeof (body as { targetCategory?: unknown } | undefined)?.targetCategory === 'string'
        ? (body as { targetCategory: string }).targetCategory
        : '';
      try {
        return { status: 200, body: await deps.moveSkillToCategory(category, skill, targetCategory) };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { status: 400, body: { error: message } };
      }
    }

    if (method === 'DELETE' && removeSkillMatch) {
      const category = decodeURIComponent(removeSkillMatch[1]);
      const skill = decodeURIComponent(removeSkillMatch[2]);
      try {
        return { status: 200, body: await deps.removeSkillFromCategory(category, skill) };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { status: 400, body: { error: message } };
      }
    }

    return { status: 404, body: { error: `Not found: ${method} ${urlPath}` } };
  };

/**
 * Any route that forgets its own try/catch — or fails in a way it didn't anticipate, e.g. a
 * transient iCloud EPERM while scanning the source tree — must degrade to a 500 body. An
 * escaping rejection would become an unhandled rejection and take the whole `spells web`
 * process down with it.
 */
export const createApiHandler = (deps: ApiDeps) => {
  const dispatch = createApiDispatcher(deps);
  return async (method: string, urlPath: string, body: unknown): Promise<ApiResult> => {
    try {
      return await dispatch(method, urlPath, body);
    } catch (e) {
      return { status: 500, body: { error: errorMessage(e) } };
    }
  };
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const readBody = (req: http.IncomingMessage): Promise<unknown> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch { resolve(undefined); }
    });
  });

export const createServer = (deps: ApiDeps, distDir: string): http.Server => {
  const apiHandler = createApiHandler(deps);
  return http.createServer(async (req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    // Last line of defense: this listener is async, so anything escaping it becomes an
    // unhandled rejection and kills the server process instead of failing one request.
    try {
      if (urlPath.startsWith('/api/')) {
        const body = req.method === 'PUT' || req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : undefined;
        const result = await apiHandler(req.method || 'GET', urlPath, body);
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result.body));
        return;
      }

      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const filePath = path.join(distDir, rel);
      try {
        const data = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        // SPA fallback
        try {
          const html = await fs.readFile(path.join(distDir, 'index.html'));
          res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
          res.end(html);
        } catch {
          res.writeHead(404).end('Not found');
        }
      }
    } catch (e) {
      console.error(`spells web: ${req.method} ${urlPath} failed:`, e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: errorMessage(e) }));
      } else {
        res.end();
      }
    }
  });
};

export interface StartServerOptions {
  /** Interface to bind. Defaults to loopback — the API is unauthenticated. */
  host?: string;
  /** Extra ports to try after EADDRINUSE. 0 = fail fast (see `spells web --strict-port`). */
  maxAttempts?: number;
}

export const startServer = (
  server: http.Server,
  preferredPort: number,
  opts: StartServerOptions = {},
): Promise<number> =>
  new Promise((resolve, reject) => {
    const host = opts.host ?? DEFAULT_HOST;
    const maxAttempts = opts.maxAttempts ?? 10;
    let port = preferredPort;
    let attempts = 0;
    const tryListen = () => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          attempts++;
          port++;
          server.removeAllListeners('listening');
          tryListen();
        } else {
          reject(err);
        }
      };
      server.once('error', onError);
      server.listen(port, host, () => {
        server.removeListener('error', onError);
        resolve(port);
      });
    };
    tryListen();
  });
