import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export const MANIFEST_NAME = '.sync-spells-manifest.json';

export interface CopyManifest {
  version: 1;
  /** Copy-mode entries: a real copy we own, keyed by skill name, with its source content hash. */
  entries: Record<string, { hash: string }>;
  /** Symlink-mode entries: a link we created, with the target we wrote. Ownership by path
   * (`isOwnedLink`) stops working the moment the registry root moves, because the recorded target
   * no longer sits inside the configured source. Recording what we wrote keeps those links
   * reclaimable — and, just as importantly, keeps links we did NOT write off limits. */
  links?: Record<string, { target: string }>;
}

const isStringKeyedRecord = (value: unknown, field: string): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(
    (e) => typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>)[field] === 'string',
  );

const isCopyManifest = (value: unknown): value is CopyManifest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const manifest = value as Partial<CopyManifest>;
  return (
    manifest.version === 1 &&
    isStringKeyedRecord(manifest.entries, 'hash') &&
    (manifest.links === undefined || isStringKeyedRecord(manifest.links, 'target'))
  );
};

/** List all file paths under root (relative, sorted), following symlinks. */
const walkFiles = async (root: string, rel = ''): Promise<string[]> => {
  const abs = path.join(root, rel);
  const st = await fs.stat(abs);
  if (!st.isDirectory()) {
    return [rel];
  }
  const entries = (await fs.readdir(abs)).sort();
  const files: string[] = [];
  for (const entry of entries) {
    files.push(...(await walkFiles(root, path.join(rel, entry))));
  }
  return files;
};

/** Content hash of a file/directory tree: relative paths + file bytes, symlinks followed. */
export const hashTree = async (root: string): Promise<string> => {
  const hash = crypto.createHash('sha256');
  for (const rel of await walkFiles(root)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(await fs.readFile(path.join(root, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
};

/** Deep copy with symlinks dereferenced — the destination contains only real entries. */
export const copyTree = async (src: string, dest: string): Promise<void> => {
  await fs.cp(src, dest, { recursive: true, dereference: true });
};

export const readCopyManifest = async (targetDir: string): Promise<CopyManifest> => {
  try {
    const raw = await fs.readFile(path.join(targetDir, MANIFEST_NAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isCopyManifest(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to empty manifest
  }
  return { version: 1, entries: {} };
};

export const writeCopyManifest = async (targetDir: string, manifest: CopyManifest): Promise<void> => {
  await fs.writeFile(path.join(targetDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');
};
