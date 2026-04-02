import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CortexConfig, RepoConfig, LanguageServerConfig } from './types.js';
import { ConfigError } from './errors.js';

const DEFAULT_CONFIG: CortexConfig = {
  version: 1,
  server: {
    port: 4170,
    host: 'localhost',
  },
  storage: {
    path: path.join(os.homedir(), '.cortex'),
    database: 'knowledge.db',
  },
  ui: {
    autoOpen: true,
  },
  languageServers: {
    typescript: {
      id: 'typescript',
      name: 'TypeScript/JavaScript',
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'],
      command: 'typescript-language-server',
      args: ['--stdio'],
      installHint: 'npm i -g typescript-language-server typescript',
      enabled: true,
    },
    python: {
      id: 'python',
      name: 'Python',
      extensions: ['.py', '.pyi'],
      command: 'pyright-langserver',
      args: ['--stdio'],
      installHint: 'pip install pyright',
      enabled: true,
    },
    rust: {
      id: 'rust',
      name: 'Rust',
      extensions: ['.rs'],
      command: 'rust-analyzer',
      args: [],
      installHint: 'rustup component add rust-analyzer',
      enabled: true,
    },
    go: {
      id: 'go',
      name: 'Go',
      extensions: ['.go'],
      command: 'gopls',
      args: ['serve'],
      installHint: 'go install golang.org/x/tools/gopls@latest',
      enabled: true,
    },
  },
  graph: {
    ignorePaths: ['node_modules', 'dist', 'build', '.git', 'coverage'],
    maxFileSize: 1_048_576,
  },
  lspPool: {
    idleTimeoutMs: 300_000,
  },
};

function resolvePath(configPath: string): string {
  if (configPath.startsWith('~')) {
    return path.join(os.homedir(), configPath.slice(1));
  }
  return path.resolve(configPath);
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    if (overrideVal === undefined) continue;

    const baseVal = base[key];
    if (
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal) &&
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

export function getCentralConfigPath(): string {
  return path.join(resolvePath(DEFAULT_CONFIG.storage.path), 'config.json');
}

export function getStoragePath(config?: CortexConfig): string {
  const storagePath = config?.storage?.path ?? DEFAULT_CONFIG.storage.path;
  return resolvePath(storagePath);
}

export function getDatabasePath(config?: CortexConfig): string {
  const storagePath = getStoragePath(config);
  const dbName = config?.storage?.database ?? DEFAULT_CONFIG.storage.database;
  return path.join(storagePath, dbName);
}

export function loadCentralConfig(): CortexConfig {
  const configPath = getCentralConfigPath();

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(raw) as Partial<CortexConfig>;
    return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, userConfig as unknown as Record<string, unknown>) as unknown as CortexConfig;
  } catch (err) {
    throw new ConfigError(
      `Failed to load config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function loadRepoConfig(repoPath: string): RepoConfig | null {
  const configPath = path.join(repoPath, '.cortex.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as RepoConfig;
  } catch (err) {
    throw new ConfigError(
      `Failed to load repo config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function mergeRepoConfig(central: CortexConfig, repo: RepoConfig | null): CortexConfig {
  if (!repo) return central;
  return deepMerge(central as unknown as Record<string, unknown>, repo as unknown as Record<string, unknown>) as unknown as CortexConfig;
}

export function getLanguageServerConfigs(config: CortexConfig): LanguageServerConfig[] {
  return Object.entries(config.languageServers)
    .filter(([_, ls]) => ls.enabled !== false)
    .map(([id, ls]) => ({
      id: ls.id ?? id,
      name: ls.name ?? id,
      extensions: ls.extensions ?? [],
      command: ls.command ?? id,
      args: ls.args ?? [],
      installHint: ls.installHint ?? `Install ${id}`,
      initializationOptions: ls.initializationOptions,
      enabled: ls.enabled ?? true,
    }));
}

export function ensureStorageDir(config?: CortexConfig): void {
  const storagePath = getStoragePath(config);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
}

export function saveCentralConfig(config: CortexConfig): void {
  const configPath = getCentralConfigPath();
  ensureStorageDir(config);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export { DEFAULT_CONFIG };
