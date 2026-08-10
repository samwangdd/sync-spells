import { describe, expect, it } from '@jest/globals';
import { isTransientFsError, withFsRetry } from '../../src/lib/fsRetry';

const fsError = (code: string) =>
  Object.assign(new Error(`${code}: operation not permitted, scandir '/icloud/profiles'`), { code });

describe('isTransientFsError', () => {
  it('treats iCloud FileProvider hiccups as transient', () => {
    for (const code of ['EPERM', 'EBUSY', 'EAGAIN', 'ENOTCONN', 'ETIMEDOUT']) {
      expect(isTransientFsError(fsError(code))).toBe(true);
    }
  });

  it('treats real filesystem errors as permanent', () => {
    for (const code of ['ENOENT', 'EACCES', 'ENOTDIR', 'EISDIR']) {
      expect(isTransientFsError(fsError(code))).toBe(false);
    }
    expect(isTransientFsError(new Error('no code at all'))).toBe(false);
  });
});

describe('withFsRetry', () => {
  it('returns the value without sleeping when the call succeeds', async () => {
    const slept: number[] = [];
    const got = await withFsRetry(async () => 'ok', { sleep: async (ms) => { slept.push(ms); } });

    expect(got).toBe('ok');
    expect(slept).toEqual([]);
  });

  it('retries a transient failure with backoff and returns the eventual success', async () => {
    const slept: number[] = [];
    let calls = 0;
    const got = await withFsRetry(
      async () => {
        calls++;
        if (calls < 3) throw fsError('EPERM');
        return 'ok';
      },
      { baseDelayMs: 10, sleep: async (ms) => { slept.push(ms); } },
    );

    expect(got).toBe('ok');
    expect(calls).toBe(3);
    expect(slept).toEqual([10, 20]);
  });

  it('rethrows the original error after exhausting attempts', async () => {
    let calls = 0;
    await expect(
      withFsRetry(async () => { calls++; throw fsError('EPERM'); }, { attempts: 3, sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'EPERM' });

    expect(calls).toBe(3);
  });

  it('does not retry a permanent error', async () => {
    let calls = 0;
    await expect(
      withFsRetry(async () => { calls++; throw fsError('ENOENT'); }, { sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    expect(calls).toBe(1);
  });
});
