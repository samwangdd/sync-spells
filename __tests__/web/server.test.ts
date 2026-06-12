import { describe, it, expect } from '@jest/globals';
import { createApiHandler } from '../../src/web/server';
import { AppState, ProfileView } from '../../src/shared/contract';

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

  it('unknown route returns 404', async () => {
    const res = await handle('GET', '/api/nope', undefined);
    expect(res.status).toBe(404);
  });
});
