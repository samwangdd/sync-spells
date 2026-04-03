import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const buildUniqueDestPath = async (backupDir: string, srcPath: string): Promise<string> => {
  const parsed = path.parse(path.basename(srcPath));
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const candidate = path.join(backupDir, `${parsed.name}${suffix}${parsed.ext}`);

    try {
      await fs.access(candidate);
      attempt++;
    } catch {
      return candidate;
    }
  }
};

export const backupPath = async (srcPath: string): Promise<string> => {
  const backupDir = path.join(os.homedir(), '.sync-spells', 'backups', timestamp());
  await fs.mkdir(backupDir, { recursive: true });
  const destPath = await buildUniqueDestPath(backupDir, srcPath);
  await fs.cp(srcPath, destPath, { recursive: true });
  return destPath;
};
