import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StorageService } from '../../src/core/storage.js';
import type {
  RepoInfo,
  KnowledgeRule,
  GraphNode,
  GraphEdge,
  KBManifest,
  BranchSnapshot,
} from '../../src/core/types.js';

let storage: StorageService;
let dbPath: string;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-test-'));
  dbPath = path.join(tmpDir, 'test.db');
  storage = new StorageService(dbPath);
});

afterEach(() => {
  storage.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeRepo(overrides: Partial<RepoInfo> = {}): RepoInfo {
  const now = new Date().toISOString();
  return {
    id: 'repo-1',
    name: 'test-repo',
    path: '/tmp/test-repo',
    status: 'initialized',
    languages: ['typescript'],
    createdAt: now,
    lastAccessedAt: now,
    ...overrides,
  };
}

function makeRule(overrides: Partial<KnowledgeRule> = {}): KnowledgeRule {
  const now = new Date().toISOString();
  return {
    id: 'rule-1',
    repoId: 'repo-1',
    type: 'constraint',
    content: 'Use apiClient for all HTTP requests',
    scope: 'global',
    version: 1,
    tags: ['http', 'api'],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    active: true,
    ...overrides,
  };
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const now = new Date().toISOString();
  return {
    id: 'repo-1:src/auth.ts',
    repoId: 'repo-1',
    filePath: 'src/auth.ts',
    language: 'typescript',
    symbols: [
      { name: 'authenticate', kind: 'function', range: { startLine: 1, endLine: 10 }, exported: true },
    ],
    summary: '',
    responsibilities: [],
    lastAnalyzed: now,
    commitHash: 'abc123',
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'edge-1',
    repoId: 'repo-1',
    source: 'repo-1:src/auth.ts',
    target: 'repo-1:src/db.ts',
    relationship: 'imports',
    symbols: ['getUser'],
    ...overrides,
  };
}

// ─── Repo Tests ───────────────────────────────────────────────────────

describe('StorageService — Repos', () => {
  it('creates and retrieves a repo by ID', () => {
    const repo = makeRepo();
    storage.createRepo(repo);

    const found = storage.getRepoById('repo-1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('repo-1');
    expect(found!.name).toBe('test-repo');
    expect(found!.path).toBe('/tmp/test-repo');
    expect(found!.status).toBe('initialized');
    expect(found!.languages).toEqual(['typescript']);
  });

  it('retrieves a repo by path', () => {
    storage.createRepo(makeRepo());

    const found = storage.getRepoByPath('/tmp/test-repo');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('repo-1');
  });

  it('returns null for non-existent repo', () => {
    expect(storage.getRepoById('nope')).toBeNull();
    expect(storage.getRepoByPath('/nope')).toBeNull();
  });

  it('lists all repos', () => {
    storage.createRepo(makeRepo({ id: 'repo-1', path: '/tmp/repo-1', name: 'repo-1' }));
    storage.createRepo(makeRepo({ id: 'repo-2', path: '/tmp/repo-2', name: 'repo-2' }));

    const repos = storage.listRepos();
    expect(repos).toHaveLength(2);
  });

  it('updates repo status', () => {
    storage.createRepo(makeRepo());
    storage.updateRepoStatus('repo-1', 'ready');

    const repo = storage.getRepoById('repo-1');
    expect(repo!.status).toBe('ready');
  });

  it('updates repo languages', () => {
    storage.createRepo(makeRepo());
    storage.updateRepoLanguages('repo-1', ['typescript', 'python']);

    const repo = storage.getRepoById('repo-1');
    expect(repo!.languages).toEqual(['typescript', 'python']);
  });

  it('deletes a repo and all related data', () => {
    storage.createRepo(makeRepo());
    storage.createRule(makeRule());
    storage.upsertGraphNode(makeNode());

    storage.deleteRepo('repo-1');

    expect(storage.getRepoById('repo-1')).toBeNull();
    expect(storage.listRules({ repoId: 'repo-1' })).toHaveLength(0);
    expect(storage.listGraphNodes('repo-1')).toHaveLength(0);
  });
});

// ─── Multi-Repo Isolation Tests ──────────────────────────────────────

describe('StorageService — Multi-Repo Isolation', () => {
  beforeEach(() => {
    storage.createRepo(makeRepo({ id: 'repo-a', path: '/tmp/repo-a', name: 'repo-a' }));
    storage.createRepo(makeRepo({ id: 'repo-b', path: '/tmp/repo-b', name: 'repo-b' }));
  });

  it('rules are isolated per repo', () => {
    storage.createRule(makeRule({ id: 'rule-a', repoId: 'repo-a', content: 'Rule for A' }));
    storage.createRule(makeRule({ id: 'rule-b', repoId: 'repo-b', content: 'Rule for B' }));

    const rulesA = storage.listRules({ repoId: 'repo-a', includeCrossRepo: false });
    const rulesB = storage.listRules({ repoId: 'repo-b', includeCrossRepo: false });

    expect(rulesA).toHaveLength(1);
    expect(rulesA[0].content).toBe('Rule for A');
    expect(rulesB).toHaveLength(1);
    expect(rulesB[0].content).toBe('Rule for B');
  });

  it('graph nodes are isolated per repo', () => {
    storage.upsertGraphNode(
      makeNode({ id: 'repo-a:src/a.ts', repoId: 'repo-a', filePath: 'src/a.ts' }),
    );
    storage.upsertGraphNode(
      makeNode({ id: 'repo-b:src/b.ts', repoId: 'repo-b', filePath: 'src/b.ts' }),
    );

    const nodesA = storage.listGraphNodes('repo-a');
    const nodesB = storage.listGraphNodes('repo-b');

    expect(nodesA).toHaveLength(1);
    expect(nodesA[0].filePath).toBe('src/a.ts');
    expect(nodesB).toHaveLength(1);
    expect(nodesB[0].filePath).toBe('src/b.ts');
  });

  it('deleting one repo does not affect another', () => {
    storage.createRule(makeRule({ id: 'rule-a', repoId: 'repo-a' }));
    storage.createRule(makeRule({ id: 'rule-b', repoId: 'repo-b' }));

    storage.deleteRepo('repo-a');

    expect(storage.getRepoById('repo-a')).toBeNull();
    expect(storage.getRepoById('repo-b')).not.toBeNull();
    expect(storage.listRules({ repoId: 'repo-b', includeCrossRepo: false })).toHaveLength(1);
  });

  it('cross-repo rules are visible to all repos', () => {
    storage.createRule(
      makeRule({ id: 'cross-rule', repoId: null, scope: 'cross-repo', content: 'Global rule' }),
    );
    storage.createRule(makeRule({ id: 'rule-a', repoId: 'repo-a', content: 'A only' }));

    const rulesA = storage.listRules({ repoId: 'repo-a', includeCrossRepo: true });
    const rulesB = storage.listRules({ repoId: 'repo-b', includeCrossRepo: true });

    expect(rulesA).toHaveLength(2);
    expect(rulesB).toHaveLength(1);
    expect(rulesB[0].content).toBe('Global rule');
  });
});

// ─── Rule Tests ───────────────────────────────────────────────────────

describe('StorageService — Rules', () => {
  beforeEach(() => {
    storage.createRepo(makeRepo());
  });

  it('creates and retrieves a rule', () => {
    const rule = makeRule();
    storage.createRule(rule);

    const found = storage.getRule('rule-1');
    expect(found).not.toBeNull();
    expect(found!.content).toBe('Use apiClient for all HTTP requests');
    expect(found!.type).toBe('constraint');
    expect(found!.tags).toEqual(['http', 'api']);
    expect(found!.active).toBe(true);
  });

  it('updates a rule and increments version', () => {
    storage.createRule(makeRule());

    const updated = storage.updateRule('rule-1', {
      content: 'Updated content',
      tags: ['updated'],
    });

    expect(updated).not.toBeNull();
    expect(updated!.version).toBe(2);
    expect(updated!.content).toBe('Updated content');
    expect(updated!.tags).toEqual(['updated']);
  });

  it('soft-deletes a rule via active flag', () => {
    storage.createRule(makeRule());
    storage.updateRule('rule-1', { active: false });

    const activeRules = storage.listRules({ repoId: 'repo-1', active: true });
    expect(activeRules).toHaveLength(0);

    const allRules = storage.listRules({ repoId: 'repo-1' });
    expect(allRules).toHaveLength(1);
    expect(allRules[0].active).toBe(false);
  });

  it('filters rules by type', () => {
    storage.createRule(makeRule({ id: 'r1', type: 'constraint' }));
    storage.createRule(makeRule({ id: 'r2', type: 'lesson', content: 'A lesson' }));
    storage.createRule(makeRule({ id: 'r3', type: 'preference', content: 'A pref' }));

    const constraints = storage.listRules({ repoId: 'repo-1', type: 'constraint' });
    expect(constraints).toHaveLength(1);
    expect(constraints[0].type).toBe('constraint');
  });

  it('computes rules version sum', () => {
    storage.createRule(makeRule({ id: 'r1', version: 3 }));
    storage.createRule(makeRule({ id: 'r2', version: 5, content: 'Another rule' }));

    const sum = storage.getRulesVersionSum('repo-1');
    expect(sum).toBe(8);
  });
});

// ─── Graph Node Tests ─────────────────────────────────────────────────

describe('StorageService — Graph Nodes', () => {
  beforeEach(() => {
    storage.createRepo(makeRepo());
  });

  it('upserts and retrieves a graph node', () => {
    const node = makeNode();
    storage.upsertGraphNode(node);

    const found = storage.getGraphNode('repo-1', 'src/auth.ts');
    expect(found).not.toBeNull();
    expect(found!.language).toBe('typescript');
    expect(found!.symbols).toHaveLength(1);
    expect(found!.symbols[0].name).toBe('authenticate');
  });

  it('updates existing node on upsert', () => {
    storage.upsertGraphNode(makeNode());
    storage.upsertGraphNode(makeNode({ summary: 'Auth module', commitHash: 'def456' }));

    const found = storage.getGraphNode('repo-1', 'src/auth.ts');
    expect(found!.summary).toBe('Auth module');
    expect(found!.commitHash).toBe('def456');
  });

  it('lists all nodes for a repo', () => {
    storage.upsertGraphNode(makeNode());
    storage.upsertGraphNode(
      makeNode({ id: 'repo-1:src/db.ts', filePath: 'src/db.ts' }),
    );

    const nodes = storage.listGraphNodes('repo-1');
    expect(nodes).toHaveLength(2);
  });

  it('deletes a node and its edges', () => {
    storage.upsertGraphNode(makeNode());
    storage.upsertGraphNode(
      makeNode({ id: 'repo-1:src/db.ts', filePath: 'src/db.ts' }),
    );
    storage.upsertGraphEdge(makeEdge());

    storage.deleteGraphNode('repo-1:src/auth.ts');

    expect(storage.getGraphNode('repo-1', 'src/auth.ts')).toBeNull();
    expect(storage.getEdgesFrom('repo-1:src/auth.ts')).toHaveLength(0);
  });

  it('counts nodes for a repo', () => {
    storage.upsertGraphNode(makeNode());
    storage.upsertGraphNode(
      makeNode({ id: 'repo-1:src/db.ts', filePath: 'src/db.ts' }),
    );

    expect(storage.getGraphNodeCount('repo-1')).toBe(2);
  });
});

// ─── Graph Edge Tests ─────────────────────────────────────────────────

describe('StorageService — Graph Edges', () => {
  beforeEach(() => {
    storage.createRepo(makeRepo());
    storage.upsertGraphNode(makeNode({ id: 'repo-1:src/auth.ts', filePath: 'src/auth.ts' }));
    storage.upsertGraphNode(makeNode({ id: 'repo-1:src/db.ts', filePath: 'src/db.ts' }));
    storage.upsertGraphNode(makeNode({ id: 'repo-1:src/logger.ts', filePath: 'src/logger.ts' }));
  });

  it('creates and queries edges from a node', () => {
    storage.upsertGraphEdge(makeEdge());

    const edges = storage.getEdgesFrom('repo-1:src/auth.ts');
    expect(edges).toHaveLength(1);
    expect(edges[0].target).toBe('repo-1:src/db.ts');
    expect(edges[0].relationship).toBe('imports');
  });

  it('queries edges to a node', () => {
    storage.upsertGraphEdge(makeEdge());

    const edges = storage.getEdgesTo('repo-1:src/db.ts');
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('repo-1:src/auth.ts');
  });

  it('supports multiple edges from one node', () => {
    storage.upsertGraphEdge(makeEdge());
    storage.upsertGraphEdge(
      makeEdge({
        id: 'edge-2',
        target: 'repo-1:src/logger.ts',
        relationship: 'imports',
        symbols: ['log'],
      }),
    );

    const edges = storage.getEdgesFrom('repo-1:src/auth.ts');
    expect(edges).toHaveLength(2);
  });

  it('counts edges for a repo', () => {
    storage.upsertGraphEdge(makeEdge());
    expect(storage.getGraphEdgeCount('repo-1')).toBe(1);
  });
});

// ─── Manifest Tests ───────────────────────────────────────────────────

describe('StorageService — Manifests', () => {
  beforeEach(() => {
    storage.createRepo(makeRepo());
  });

  it('upserts and retrieves a manifest', () => {
    const manifest: KBManifest = {
      repoId: 'repo-1',
      version: 1,
      baseCommit: 'abc123',
      stagedHash: 'hash123',
      indexedFiles: ['src/auth.ts'],
      indexedFileCount: 1,
      rulesVersion: 5,
      rulesCount: 2,
      graphNodeCount: 3,
      graphEdgeCount: 4,
      lastSyncedAt: new Date().toISOString(),
      lastSyncedBy: 'manual',
      branchName: 'main',
    };

    storage.upsertManifest(manifest);

    const found = storage.getManifest('repo-1');
    expect(found).not.toBeNull();
    expect(found!.baseCommit).toBe('abc123');
    expect(found!.indexedFiles).toEqual(['src/auth.ts']);
    expect(found!.graphNodeCount).toBe(3);
  });

  it('updates manifest on upsert', () => {
    const manifest: KBManifest = {
      repoId: 'repo-1',
      version: 1,
      baseCommit: 'abc123',
      stagedHash: 'hash123',
      indexedFiles: [],
      indexedFileCount: 0,
      rulesVersion: 0,
      rulesCount: 0,
      graphNodeCount: 0,
      graphEdgeCount: 0,
      lastSyncedAt: new Date().toISOString(),
      lastSyncedBy: 'manual',
      branchName: 'main',
    };

    storage.upsertManifest(manifest);
    storage.upsertManifest({ ...manifest, baseCommit: 'def456', stagedHash: 'newhash' });

    const found = storage.getManifest('repo-1');
    expect(found!.baseCommit).toBe('def456');
    expect(found!.stagedHash).toBe('newhash');
  });

  it('returns null for non-existent manifest', () => {
    expect(storage.getManifest('repo-1')).toBeNull();
  });
});

// ─── Branch Snapshot Tests ────────────────────────────────────────────

describe('StorageService — Branch Snapshots', () => {
  beforeEach(() => {
    storage.createRepo(makeRepo());
  });

  it('upserts and retrieves a branch snapshot', () => {
    const snapshot: BranchSnapshot = {
      id: 'snap-1',
      repoId: 'repo-1',
      branchName: 'feature/auth',
      parentBranch: 'main',
      baseCommit: 'abc123',
      snapshotData: JSON.stringify({ rules: [], nodes: [] }),
      createdAt: new Date().toISOString(),
    };

    storage.upsertBranchSnapshot(snapshot);

    const found = storage.getBranchSnapshot('repo-1', 'feature/auth');
    expect(found).not.toBeNull();
    expect(found!.branchName).toBe('feature/auth');
    expect(found!.parentBranch).toBe('main');
  });

  it('deletes a branch snapshot', () => {
    const snapshot: BranchSnapshot = {
      id: 'snap-1',
      repoId: 'repo-1',
      branchName: 'feature/auth',
      parentBranch: 'main',
      baseCommit: 'abc123',
      snapshotData: '{}',
      createdAt: new Date().toISOString(),
    };

    storage.upsertBranchSnapshot(snapshot);
    storage.deleteBranchSnapshot('repo-1', 'feature/auth');

    expect(storage.getBranchSnapshot('repo-1', 'feature/auth')).toBeNull();
  });
});

// ─── Repo Stats Tests ─────────────────────────────────────────────────

describe('StorageService — Stats', () => {
  it('returns aggregate stats for a repo', () => {
    storage.createRepo(makeRepo());
    storage.createRule(makeRule());
    storage.upsertGraphNode(makeNode());
    storage.upsertGraphNode(makeNode({ id: 'repo-1:src/db.ts', filePath: 'src/db.ts' }));
    storage.upsertGraphEdge(makeEdge());

    const stats = storage.getRepoStats('repo-1');
    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
    expect(stats.ruleCount).toBe(1);
  });
});

// ─── Transaction Tests ────────────────────────────────────────────────

describe('StorageService — Transactions', () => {
  it('rolls back on error', () => {
    storage.createRepo(makeRepo());

    try {
      storage.transaction(() => {
        storage.createRule(makeRule({ id: 'r1' }));
        storage.createRule(makeRule({ id: 'r2', content: 'Second rule' }));
        throw new Error('Simulated failure');
      });
    } catch {
      // expected
    }

    const rules = storage.listRules({ repoId: 'repo-1' });
    expect(rules).toHaveLength(0);
  });
});
