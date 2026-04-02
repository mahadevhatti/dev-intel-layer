import type { LanguageServerConfig } from '../core/types.js';

const BUILT_IN_SERVERS: LanguageServerConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript/JavaScript',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint: 'npm i -g typescript-language-server typescript',
    enabled: true,
  },
  {
    id: 'python',
    name: 'Python',
    extensions: ['.py', '.pyi'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    installHint: 'pip install pyright',
    enabled: true,
  },
  {
    id: 'rust',
    name: 'Rust',
    extensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
    installHint: 'rustup component add rust-analyzer',
    enabled: true,
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['.go'],
    command: 'gopls',
    args: ['serve'],
    installHint: 'go install golang.org/x/tools/gopls@latest',
    enabled: true,
  },
];

export class LanguageServerRegistry {
  private servers: Map<string, LanguageServerConfig> = new Map();

  constructor(customServers?: LanguageServerConfig[]) {
    for (const server of BUILT_IN_SERVERS) {
      this.servers.set(server.id, server);
    }
    if (customServers) {
      for (const server of customServers) {
        this.servers.set(server.id, server);
      }
    }
  }

  getServer(id: string): LanguageServerConfig | undefined {
    return this.servers.get(id);
  }

  getServerForExtension(ext: string): LanguageServerConfig | undefined {
    for (const server of this.servers.values()) {
      if (server.enabled !== false && server.extensions.includes(ext)) {
        return server;
      }
    }
    return undefined;
  }

  getServerForLanguage(language: string): LanguageServerConfig | undefined {
    return this.servers.get(language);
  }

  listServers(): LanguageServerConfig[] {
    return [...this.servers.values()].filter((s) => s.enabled !== false);
  }

  detectServersForFiles(filePaths: string[]): LanguageServerConfig[] {
    const needed = new Map<string, LanguageServerConfig>();
    for (const filePath of filePaths) {
      const ext = filePath.substring(filePath.lastIndexOf('.'));
      const server = this.getServerForExtension(ext);
      if (server && !needed.has(server.id)) {
        needed.set(server.id, server);
      }
    }
    return [...needed.values()];
  }
}
