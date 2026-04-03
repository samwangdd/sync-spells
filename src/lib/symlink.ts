import * as fs from 'fs/promises';
import * as path from 'path';

export type SymlinkState = 'linked' | 'missing' | 'broken' | 'real-dir' | 'wrong-target';

export const checkSymlinkState = async (
  destPath: string,
  expectedTarget: string,
): Promise<SymlinkState> => {
  let stats;

  try {
    stats = await fs.lstat(destPath);
  } catch {
    return 'missing';
  }

  if (!stats.isSymbolicLink()) {
    return 'real-dir';
  }

  let actualTarget: string;

  try {
    actualTarget = await fs.readlink(destPath);
  } catch {
    return 'broken';
  }

  const resolvedActualTarget = path.resolve(path.dirname(destPath), actualTarget);
  const resolvedExpectedTarget = path.resolve(expectedTarget);

  try {
    await fs.stat(resolvedActualTarget);
  } catch {
    return 'broken';
  }

  return resolvedActualTarget === resolvedExpectedTarget ? 'linked' : 'wrong-target';
};

export const createSymlink = async (src: string, dest: string): Promise<void> => {
  await fs.symlink(src, dest);
};

export const removeSymlink = async (linkPath: string): Promise<void> => {
  await fs.unlink(linkPath);
};
