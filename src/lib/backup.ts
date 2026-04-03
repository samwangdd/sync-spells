import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const buildUniqueDestPath = async (
  backupDir: string,
  srcPath: string,
): Promise<{ destPath: string; lockPath: string; lockHandle: fs.FileHandle }> => {
  const parsed = path.parse(path.basename(srcPath));
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const candidate = path.join(backupDir, `${parsed.name}${suffix}${parsed.ext}`);
    const lockPath = `${candidate}.lock`;

    try {
      const lockHandle = await fs.open(lockPath, 'wx');
      try {
        await fs.access(candidate);
        await lockHandle.close();
        await fs.unlink(lockPath);
        attempt++;
        continue;
      } catch {
        return { destPath: candidate, lockPath, lockHandle };
      }
    } catch {
      attempt++;
    }
  }
};

export const backupPath = async (srcPath: string): Promise<string> => {
  const backupDir = path.join(os.homedir(), '.sync-spells', 'backups', timestamp());
  await fs.mkdir(backupDir, { recursive: true });
  const { destPath, lockPath, lockHandle } = await buildUniqueDestPath(backupDir, srcPath);

  try {
    await fs.cp(srcPath, destPath, { recursive: true });
    return destPath;
  } finally {
    await lockHandle.close().catch(() => {});
    await fs.unlink(lockPath).catch(() => {});
  }
};
