import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const timestamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export const backupPath = async (srcPath: string): Promise<string> => {
  const backupDir = path.join(os.homedir(), '.sync-spells', 'backups', timestamp());
  await fs.mkdir(backupDir, { recursive: true });
  const destPath = path.join(backupDir, path.basename(srcPath));
  await fs.cp(srcPath, destPath, { recursive: true });
  return destPath;
};
