import { spawn, type ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import type { MessageConnection } from 'vscode-jsonrpc/node.js';
import { LSPServerNotAvailableError } from '../core/errors.js';
import { LanguageServerRegistry } from './registry.js';
import { createLSPConnection, initializeLSP, shutdownLSP, filePathToUri } from './protocol.js';

interface PoolEntry {
  serverId: string;
  repoId: string;
  process: ChildProcess;
  connection: MessageConnection;
  capabilities: unknown;
  lastUsedAt: number;
  initialized: boolean;
}

function poolKey(repoId: string, serverId: string): string {
  return `${repoId}::${serverId}`;
}

export class LSPServerPool {
  private pool: Map<string, PoolEntry> = new Map();
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private registry: LanguageServerRegistry,
    private idleTimeoutMs: number = 300_000,
  ) {
    this.startIdleCheck();
  }

  detectLanguages(_repoPath: string, files: string[]): string[] {
    const servers = this.registry.detectServersForFiles(files);
    return servers.map((s) => s.id);
  }

  checkAvailability(serverId: string): { available: boolean; installHint?: string } {
    const config = this.registry.getServer(serverId);
    if (!config) {
      return { available: false, installHint: `Unknown server: ${serverId}` };
    }

    try {
      execSync(`which ${config.command}`, { stdio: 'ignore' });
      return { available: true };
    } catch {
      return { available: false, installHint: config.installHint };
    }
  }

  async getOrSpawn(repoId: string, serverId: string): Promise<MessageConnection> {
    const key = poolKey(repoId, serverId);
    const existing = this.pool.get(key);
    if (existing && existing.initialized) {
      existing.lastUsedAt = Date.now();
      return existing.connection;
    }

    const config = this.registry.getServer(serverId);
    if (!config) {
      throw new LSPServerNotAvailableError(serverId, `Unknown server: ${serverId}`);
    }

    const availability = this.checkAvailability(serverId);
    if (!availability.available) {
      throw new LSPServerNotAvailableError(serverId, availability.installHint ?? config.installHint);
    }

    const childProcess = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const connection = createLSPConnection(childProcess);

    const entry: PoolEntry = {
      serverId,
      repoId,
      process: childProcess,
      connection,
      capabilities: null,
      lastUsedAt: Date.now(),
      initialized: false,
    };

    this.pool.set(key, entry);

    childProcess.on('exit', () => {
      this.pool.delete(key);
    });

    return connection;
  }

  async initialize(
    repoId: string,
    serverId: string,
    rootPath: string,
  ): Promise<unknown> {
    const key = poolKey(repoId, serverId);
    const entry = this.pool.get(key);
    if (!entry) {
      throw new Error(`No LSP server spawned for ${key}. Call getOrSpawn first.`);
    }

    if (entry.initialized && entry.capabilities) {
      return entry.capabilities;
    }

    const config = this.registry.getServer(serverId);
    const rootUri = filePathToUri(rootPath);
    const result = await initializeLSP(
      entry.connection,
      rootUri,
      config?.initializationOptions,
    );

    entry.capabilities = result;
    entry.initialized = true;
    entry.lastUsedAt = Date.now();

    return result;
  }

  async query<T>(
    repoId: string,
    serverId: string,
    method: string,
    params: unknown,
  ): Promise<T> {
    const key = poolKey(repoId, serverId);
    const entry = this.pool.get(key);
    if (!entry || !entry.initialized) {
      throw new Error(`LSP server ${key} not initialized`);
    }

    entry.lastUsedAt = Date.now();
    return entry.connection.sendRequest(method, params) as Promise<T>;
  }

  getConnection(repoId: string, serverId: string): MessageConnection | null {
    const key = poolKey(repoId, serverId);
    const entry = this.pool.get(key);
    if (!entry || !entry.initialized) return null;
    entry.lastUsedAt = Date.now();
    return entry.connection;
  }

  async shutdown(repoId: string, serverId: string): Promise<void> {
    const key = poolKey(repoId, serverId);
    const entry = this.pool.get(key);
    if (!entry) return;

    try {
      if (entry.initialized) {
        await shutdownLSP(entry.connection);
      }
    } catch {
      // Best effort
    } finally {
      entry.process.kill();
      this.pool.delete(key);
    }
  }

  async shutdownRepo(repoId: string): Promise<void> {
    const entries = [...this.pool.entries()].filter(([_, e]) => e.repoId === repoId);
    await Promise.allSettled(
      entries.map(([_, e]) => this.shutdown(e.repoId, e.serverId)),
    );
  }

  async shutdownAll(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }

    await Promise.allSettled(
      [...this.pool.values()].map((e) => this.shutdown(e.repoId, e.serverId)),
    );
  }

  getActiveCount(): number {
    return this.pool.size;
  }

  private startIdleCheck() {
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.pool.entries()) {
        if (now - entry.lastUsedAt > this.idleTimeoutMs) {
          this.shutdown(entry.repoId, entry.serverId).catch(() => {
            this.pool.delete(key);
          });
        }
      }
    }, 60_000);

    if (this.idleTimer.unref) {
      this.idleTimer.unref();
    }
  }
}
