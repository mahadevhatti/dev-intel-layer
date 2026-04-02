import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import type { Server } from 'node:http';
import { StorageService } from '../../src/core/storage.js';
import { RepoManager } from '../../src/repo/repoManager.js';
import { RepoRouter } from '../../src/repo/repoRouter.js';
import { RuleService } from '../../src/knowledge/ruleService.js';
import { ManifestService } from '../../src/manifest/manifestService.js';
import { SyncService } from '../../src/sync/syncService.js';
import { GraphQuery } from '../../src/graph/graphQuery.js';
import { createHttpServer, startServer } from '../../src/server/httpServer.js';

let tmpDir: string;
let dbPath: string;
let storage: StorageService;
let server: Server;
let baseUrl: string;
let gitRepoPath: string;

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dil-api-test-')));
  dbPath = path.join(tmpDir, 'test.db');
  storage = new StorageService(dbPath);

  gitRepoPath = path.join(tmpDir, 'repo');
  fs.mkdirSync(gitRepoPath);
  execSync('git init', { cwd: gitRepoPath, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: gitRepoPath, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: gitRepoPath, stdio: 'ignore' });
  fs.writeFileSync(path.join(gitRepoPath, 'index.ts'), 'export const a = 1;');
  execSync('git add . && git commit -m "init"', { cwd: gitRepoPath, stdio: 'ignore' });

  const repoManager = new RepoManager(storage);
  const repoRouter = new RepoRouter(repoManager, storage);
  const ruleService = new RuleService(storage);
  const manifestService = new ManifestService(storage);
  const syncService = new SyncService(storage);
  const graphQuery = new GraphQuery(storage);

  const app = createHttpServer({
    storage,
    repoManager,
    repoRouter,
    ruleService,
    manifestService,
    syncService,
    graphQuery,
  });

  server = await startServer(app, 0, 'localhost');
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server?.close();
  storage?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${baseUrl}${endpoint}`, options);
  return { status: res.status, data: await res.json() };
}

describe('REST API', () => {
  it('GET /api/health returns ok', async () => {
    const { status, data } = await api('/api/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('GET /api/repos returns empty list initially', async () => {
    const { status, data } = await api('/api/repos');
    expect(status).toBe(200);
    expect(data.repos).toEqual([]);
  });

  it('GET /api/repos/manifest auto-registers repo', async () => {
    const { status, data } = await api(
      `/api/repos/manifest?repoPath=${encodeURIComponent(gitRepoPath)}`,
    );
    expect(status).toBe(200);
    expect(data.stagedHash).toBe('UNKNOWN');
  });

  it('GET /api/repos lists registered repos after access', async () => {
    const { data } = await api('/api/repos');
    expect(data.repos.length).toBeGreaterThanOrEqual(1);
    expect(data.repos[0].name).toBe('repo');
  });

  it('GET /api/repos/:repoId returns repo detail', async () => {
    const { data: listData } = await api('/api/repos');
    const repoId = listData.repos[0].id;

    const { status, data } = await api(`/api/repos/${repoId}`);
    expect(status).toBe(200);
    expect(data.repo.id).toBe(repoId);
    expect(data.stats).toBeDefined();
  });

  it('POST /api/repos/:repoId/rules creates a rule', async () => {
    const { data: listData } = await api('/api/repos');
    const repoId = listData.repos[0].id;

    const { status, data } = await api(`/api/repos/${repoId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'constraint',
        content: 'Use apiClient for all HTTP requests',
        tags: ['http'],
      }),
    });

    expect(status).toBe(201);
    expect(data.rule.content).toBe('Use apiClient for all HTTP requests');
    expect(data.rule.type).toBe('constraint');
  });

  it('GET /api/repos/:repoId/rules lists rules', async () => {
    const { data: listData } = await api('/api/repos');
    const repoId = listData.repos[0].id;

    const { status, data } = await api(`/api/repos/${repoId}/rules`);
    expect(status).toBe(200);
    expect(data.rules.length).toBeGreaterThanOrEqual(1);
  });

  it('PUT /api/repos/:repoId/rules/:id updates a rule', async () => {
    const { data: listData } = await api('/api/repos');
    const repoId = listData.repos[0].id;
    const { data: rulesData } = await api(`/api/repos/${repoId}/rules`);
    const ruleId = rulesData.rules[0].id;

    const { status, data } = await api(`/api/repos/${repoId}/rules/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Updated rule content' }),
    });

    expect(status).toBe(200);
    expect(data.rule.content).toBe('Updated rule content');
    expect(data.rule.version).toBe(2);
  });

  it('GET /api/repos/:repoId/graph returns empty graph', async () => {
    const { data: listData } = await api('/api/repos');
    const repoId = listData.repos[0].id;

    const { status, data } = await api(`/api/repos/${repoId}/graph`);
    expect(status).toBe(200);
    expect(data.nodes).toBeDefined();
    expect(data.edges).toBeDefined();
  });

  it('GET /api/repos/:repoId/stats returns stats', async () => {
    const { data: listData } = await api('/api/repos');
    const repoId = listData.repos[0].id;

    const { status, data } = await api(`/api/repos/${repoId}/stats`);
    expect(status).toBe(200);
    expect(typeof data.nodeCount).toBe('number');
    expect(typeof data.ruleCount).toBe('number');
  });

  it('POST /api/rules/cross-repo creates cross-repo rule', async () => {
    const { status, data } = await api('/api/rules/cross-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'preference',
        content: 'Use conventional commits',
        tags: ['git'],
      }),
    });

    expect(status).toBe(201);
    expect(data.rule.scope).toBe('cross-repo');
    expect(data.rule.repoId).toBeNull();
  });

  it('GET /api/rules/cross-repo lists cross-repo rules', async () => {
    const { status, data } = await api('/api/rules/cross-repo');
    expect(status).toBe(200);
    expect(data.rules.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/repos/notify accepts git hook events', async () => {
    const { status, data } = await api('/api/repos/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath: gitRepoPath,
        event: 'post-merge',
      }),
    });

    expect(status).toBe(200);
    expect(data.received).toBe(true);
  });
});
