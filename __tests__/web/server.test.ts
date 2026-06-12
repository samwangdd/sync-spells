import { describe, it, expect, afterEach } from '@jest/globals';
import { createApiHandler, createServer, startServer } from '../../src/web/server';
import { AppState, ProfileView } from '../../src/shared/contract';
import * as http from 'http';

const sampleState: AppState = { profiles: [], skills: [], categories: [] };
const sampleView: ProfileView = {
  name: 'code', categories: ['coding'], extras: [], excludes: [], skills: [],
  resolvedRefs: ['coding/git-commit'], skillCount: 1, boundPaths: [],
};

class FakeValidationError extends Error {}

const deps = {
  getState: async () => sampleState,
  writeProfile: async (name: string, body: any) => {
    if (body && body.bad) { const e = new FakeValidationError('bad shape'); e.name = 'ProfileValidationError'; throw e; }
    if (body && body.boom) throw new Error('disk locked');
    return sampleView;
  },
  readMarkdown: async (ref: string) => `# ${ref}`,
  removeSkillFromCategory: async (category: string, skill: string) => ({
    movedTo: `inbox/${skill}`,
    removedRef: `${category}/${skill}`,
  }),
  moveSkillToCategory: async (category: string, skill: string, targetCategory: string) => ({
    movedTo: `${targetCategory}/${skill}`,
    removedRef: `${category}/${skill}`,
  }),
  createCategory: async (name: string) => ({ name, skillRefs: [] }),
};

describe('createApiHandler', () => {
  const handle = createApiHandler(deps as any);

  it('GET /api/state returns 200 + state', async () => {
    const res = await handle('GET', '/api/state', undefined);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleState);
  });

  it('PUT /api/profiles/:name returns 200 + view', async () => {
    const res = await handle('PUT', '/api/profiles/code', { name: 'code' });
    expect(res.status).toBe(200);
    expect((res.body as ProfileView).name).toBe('code');
  });

  it('PUT with validation error returns 400', async () => {
    const res = await handle('PUT', '/api/profiles/code', { bad: true });
    expect(res.status).toBe(400);
    expect((res.body as any).error).toContain('bad shape');
  });

  it('PUT with write failure returns 500', async () => {
    const res = await handle('PUT', '/api/profiles/code', { boom: true });
    expect(res.status).toBe(500);
  });

  it('GET /api/skill/:ref/markdown returns 200 + markdown', async () => {
    const res = await handle('GET', '/api/skill/coding%2Fgit-commit/markdown', undefined);
    expect(res.status).toBe(200);
    expect((res.body as any).markdown).toBe('# coding/git-commit');
  });

  it('DELETE /api/categories/:category/skills/:skill removes a skill from that category', async () => {
    const res = await handle('DELETE', '/api/categories/coding/skills/git-commit', undefined);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      movedTo: 'inbox/git-commit',
      removedRef: 'coding/git-commit',
    });
  });

  it('PATCH /api/categories/:category/skills/:skill moves a skill to another category', async () => {
    const res = await handle('PATCH', '/api/categories/coding/skills/scss', { targetCategory: 'workflow' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      movedTo: 'workflow/scss',
      removedRef: 'coding/scss',
    });
  });

  it('POST /api/categories creates a category', async () => {
    const res = await handle('POST', '/api/categories', { name: 'research' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'research', skillRefs: [] });
  });

  it('unknown route returns 404', async () => {
    const res = await handle('GET', '/api/nope', undefined);
    expect(res.status).toBe(404);
  });
});

describe('startServer', () => {
  const PORT = 4319;
  let blocker: http.Server;
  let realServer: http.Server;

  afterEach(async () => {
    await Promise.all([
      realServer ? new Promise<void>((r) => realServer.close(() => r())) : Promise.resolve(),
      blocker ? new Promise<void>((r) => blocker.close(() => r())) : Promise.resolve(),
    ]);
  });

  it('auto-increments to the next port when preferred is busy', async () => {
    // occupy PORT
    blocker = http.createServer();
    await new Promise<void>((r) => blocker.listen(PORT, r));

    const trivialDeps = {
      getState: async () => ({ profiles: [], skills: [], categories: [] }),
      writeProfile: async () => ({} as any),
      readMarkdown: async () => '',
      removeSkillFromCategory: async () => ({ removedRef: '', movedTo: '' }),
      moveSkillToCategory: async () => ({ removedRef: '', movedTo: '' }),
      createCategory: async () => ({ name: '', skillRefs: [] }),
    };
    realServer = createServer(trivialDeps, '/tmp/nonexistent-dist');

    const got = await startServer(realServer, PORT);
    expect(got).toBe(PORT + 1);
  });
});
