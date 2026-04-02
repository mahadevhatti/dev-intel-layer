import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadCentralConfig,
  loadRepoConfig,
  mergeRepoConfig,
  getLanguageServerConfigs,
  DEFAULT_CONFIG,
} from '../../src/core/config.js';
import type { CortexConfig, RepoConfig } from '../../src/core/types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-config-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Config — Central Config', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadCentralConfig();
    expect(config.server.port).toBe(4170);
    expect(config.server.host).toBe('localhost');
    expect(config.storage.database).toBe('knowledge.db');
    expect(config.graph.ignorePaths).toContain('node_modules');
  });

  it('has all required default language servers', () => {
    const config = loadCentralConfig();
    expect(config.languageServers.typescript).toBeDefined();
    expect(config.languageServers.python).toBeDefined();
    expect(config.languageServers.rust).toBeDefined();
    expect(config.languageServers.go).toBeDefined();
  });
});

describe('Config — Repo Config', () => {
  it('returns null when no repo config exists', () => {
    const config = loadRepoConfig(tmpDir);
    expect(config).toBeNull();
  });

  it('loads repo config from .cortex.json', () => {
    const repoConfig: RepoConfig = {
      languageServers: { python: { enabled: false } },
      graph: { ignorePaths: ['generated'] },
    };

    fs.writeFileSync(
      path.join(tmpDir, '.cortex.json'),
      JSON.stringify(repoConfig),
    );

    const config = loadRepoConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.languageServers!.python!.enabled).toBe(false);
  });
});

describe('Config — Merge', () => {
  it('repo config overrides central config', () => {
    const central = { ...DEFAULT_CONFIG };
    const repoConfig: RepoConfig = {
      languageServers: { python: { enabled: false } },
      graph: { ignorePaths: ['node_modules', 'generated'] },
    };

    const merged = mergeRepoConfig(central, repoConfig);
    expect(merged.languageServers.python!.enabled).toBe(false);
    expect(merged.languageServers.typescript!.enabled).toBe(true);
    expect(merged.graph.ignorePaths).toContain('generated');
  });

  it('returns central config when repo config is null', () => {
    const central = { ...DEFAULT_CONFIG };
    const merged = mergeRepoConfig(central, null);
    expect(merged).toEqual(central);
  });
});

describe('Config — Language Server Configs', () => {
  it('filters disabled servers', () => {
    const config: CortexConfig = {
      ...DEFAULT_CONFIG,
      languageServers: {
        ...DEFAULT_CONFIG.languageServers,
        python: { ...DEFAULT_CONFIG.languageServers.python, enabled: false },
      },
    };

    const servers = getLanguageServerConfigs(config);
    const ids = servers.map((s) => s.id);
    expect(ids).toContain('typescript');
    expect(ids).not.toContain('python');
  });

  it('includes all enabled servers with full config', () => {
    const servers = getLanguageServerConfigs(DEFAULT_CONFIG);
    expect(servers.length).toBeGreaterThanOrEqual(4);

    const ts = servers.find((s) => s.id === 'typescript');
    expect(ts).toBeDefined();
    expect(ts!.command).toBe('typescript-language-server');
    expect(ts!.extensions).toContain('.ts');
  });
});
