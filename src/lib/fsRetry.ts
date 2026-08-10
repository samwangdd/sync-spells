/**
 * The spells source tree normally lives in iCloud Drive
 * (`~/Library/Mobile Documents/com~apple~CloudDocs/...`). While the macOS FileProvider daemon
 * is re-materializing a directory — e.g. right after `spells use`/`bind` rewrote `profiles/` —
 * a `scandir`/`open` on that directory can transiently fail with EPERM even though the caller
 * clearly owns it and `fs.access` just succeeded. It succeeds again milliseconds later.
 *
 * So: retry the small set of codes iCloud actually emits for this, and let every genuine
 * error (ENOENT, EACCES, ENOTDIR, ...) fail fast on the first attempt.
 */
const TRANSIENT_CODES = new Set(['EPERM', 'EBUSY', 'EAGAIN', 'ENOTCONN', 'ETIMEDOUT']);

export const isTransientFsError = (err: unknown): boolean => {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
};

export interface FsRetryOptions {
  /** Total attempts, including the first one. */
  attempts?: number;
  /** First backoff delay; doubles per retry. */
  baseDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const withFsRetry = async <T>(fn: () => Promise<T>, opts: FsRetryOptions = {}): Promise<T> => {
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 30;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isTransientFsError(err)) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
};
