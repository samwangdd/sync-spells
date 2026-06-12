import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppState, ProfileView } from '../shared/contract';

export interface ApiDeps {
  getState: () => Promise<AppState>;
  writeProfile: (name: string, body: unknown) => Promise<ProfileView>;
  readMarkdown: (ref: string) => Promise<string>;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

const isValidationError = (e: unknown): boolean =>
  e instanceof Error && e.name === 'ProfileValidationError';

export const createApiHandler =
  (deps: ApiDeps) =>
  async (method: string, urlPath: string, body: unknown): Promise<ApiResult> => {
    if (method === 'GET' && urlPath === '/api/state') {
      return { status: 200, body: await deps.getState() };
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

    return { status: 404, body: { error: `Not found: ${method} ${urlPath}` } };
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

    if (urlPath.startsWith('/api/')) {
      const body = req.method === 'PUT' || req.method === 'POST' ? await readBody(req) : undefined;
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
  });
};

export const startServer = (server: http.Server, preferredPort: number, maxAttempts = 10): Promise<number> =>
  new Promise((resolve, reject) => {
    let port = preferredPort;
    let attempts = 0;
    const tryListen = () => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          attempts++;
          port++;
          tryListen();
        } else {
          reject(err);
        }
      });
      server.listen(port, () => resolve(port));
    };
    tryListen();
  });
