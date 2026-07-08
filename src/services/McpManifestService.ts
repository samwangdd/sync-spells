import * as fs from 'fs/promises';
import * as path from 'path';
import { McpManifest } from '../types/mcp';

const emptyManifest = (): McpManifest => ({ targets: {} });

export class McpManifestService {
  constructor(private manifestPath: string) {}

  async read(): Promise<McpManifest> {
    try {
      const raw = await fs.readFile(this.manifestPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return emptyManifest();
      }

      const manifest = parsed as Partial<McpManifest>;

      if (typeof manifest.targets !== 'object' || manifest.targets === null || Array.isArray(manifest.targets)) {
        return emptyManifest();
      }

      const targets: Record<string, string[]> = {};

      for (const [target, entries] of Object.entries(manifest.targets)) {
        if (Array.isArray(entries) && entries.every((entry) => typeof entry === 'string')) {
          targets[target] = [...entries].sort();
        }
      }

      return { targets };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyManifest();
      }

      throw error;
    }
  }

  async write(manifest: McpManifest): Promise<void> {
    await fs.mkdir(path.dirname(this.manifestPath), { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify({ targets: manifest.targets }, null, 2), 'utf8');
  }

  async owns(targetKey: string, serverName: string): Promise<boolean> {
    const manifest = await this.read();
    return (manifest.targets[targetKey] || []).includes(serverName);
  }

  async setOwnedEntries(targetKey: string, entries: string[]): Promise<void> {
    const manifest = await this.read();
    manifest.targets[targetKey] = [...entries].sort();
    await this.write(manifest);
  }

  async addOwnedEntries(targetKey: string, entries: string[]): Promise<void> {
    const manifest = await this.read();
    const merged = new Set([...(manifest.targets[targetKey] || []), ...entries]);
    manifest.targets[targetKey] = [...merged].sort();
    await this.write(manifest);
  }
}
