import * as fs from 'fs/promises';
import * as path from 'path';

export interface GlobalSyncResult {
  tool: string;
  skill: string;
  action: 'linked' | 'updated' | 'skipped' | 'pruned' | 'error';
  error?: string;
}

/** A target entry is sync-spells-owned iff it is a symlink resolving inside sourceRoot. */
export const isOwnedLink = async (linkPath: string, sourceRoot: string): Promise<boolean> => {
  try {
    const st = await fs.lstat(linkPath);
    if (!st.isSymbolicLink()) {
      return false;
    }
    const target = await fs.readlink(linkPath);
    const resolved = path.resolve(path.dirname(linkPath), target);
    return resolved === sourceRoot || resolved.startsWith(sourceRoot + path.sep);
  } catch {
    return false;
  }
};
