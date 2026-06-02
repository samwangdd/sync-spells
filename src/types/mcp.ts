export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpSourceConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface LoadedMcpConfig {
  servers: Record<string, McpServerConfig>;
  sources: string[];
}

export type McpToolKey = 'claude-code' | 'cursor' | 'codex';
export type McpScope = 'global' | 'project';

export interface McpManifest {
  targets: Record<string, string[]>;
}

export type McpChangeAction = 'add' | 'update' | 'remove' | 'skip' | 'conflict';

export interface McpChange {
  tool: McpToolKey;
  scope: McpScope;
  server: string;
  action: McpChangeAction;
  targetPath: string;
  message?: string;
}
