import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export const MANIFEST_NAME = '.sync-spells-manifest.json';

export interface CopyManifest {
  version: 1;
  entries: Record<string, { hash: string }>;
}

const isCopyManifest = (value: unknown): value is CopyManifest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const manifest = value as Partial<CopyManifest>;
  return (
    manifest.version === 1 &&
    typeof manifest.entries === 'object' &&
    manifest.entries !== null &&
    !Array.isArray(manifest.entries) &&
    Object.values(manifest.entries).every(
      (e) => typeof e === 'object' && e !== null && typeof (e as { hash?: unknown }).hash === 'string',
    )
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
