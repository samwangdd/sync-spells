import * as fs from 'fs/promises';
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

  try {
    await fs.stat(destPath);
  } catch {
    return 'broken';
  }

  return actualTarget === expectedTarget ? 'linked' : 'wrong-target';
};

export const createSymlink = async (src: string, dest: string): Promise<void> => {
  await fs.symlink(src, dest);
};

export const removeSymlink = async (linkPath: string): Promise<void> => {
  await fs.unlink(linkPath);
};
