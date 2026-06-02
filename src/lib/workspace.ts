import * as fs from 'fs/promises';
import * as path from 'path';

export interface WorkspaceManifest {
  version: number;
  library: string;
  profiles: string;
  agents: string;
  legacy: string[];
}

export const MANIFEST_FILE = 'workspace.json';

export const defaultManifest: WorkspaceManifest = {
  version: 1,
  library: 'skill-category',
  profiles: 'profiles',
  agents: 'agents',
  legacy: [],
};

const isWorkspaceManifest = (value: unknown): value is WorkspaceManifest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const m = value as Partial<WorkspaceManifest>;
  return (
    typeof m.version === 'number' &&
    typeof m.library === 'string' &&
    typeof m.profiles === 'string' &&
    typeof m.agents === 'string' &&
    Array.isArray(m.legacy) &&
    m.legacy.every((e) => typeof e === 'string')
  );
};

export const manifestPath = (root: string): string => path.join(root, MANIFEST_FILE);

export const readManifest = async (root: string): Promise<WorkspaceManifest> => {
  try {
    const raw = await fs.readFile(manifestPath(root), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isWorkspaceManifest(parsed) ? parsed : { ...defaultManifest };
  } catch {
    return { ...defaultManifest };
  }
};

export const writeManifest = async (root: string, manifest: WorkspaceManifest): Promise<void> => {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(manifestPath(root), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
};
