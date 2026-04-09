import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  RepoInfo,
  RepoStatus,
  KnowledgeRule,
  KnowledgeType,
  KnowledgeScope,
  KnowledgeSource,
  GraphNode,
  GraphEdge,
  EdgeRelationship,
  KBManifest,
  BranchSnapshot,
  SymbolInfo,
  RepoDocument,
  DocType,
} from './types.js';
import { StorageError } from './errors.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  path             TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'initialized'
                     CHECK(status IN ('initialized', 'scanning', 'ready', 'error')),
  languages        TEXT DEFAULT '[]',
  created_at       TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT REFERENCES repos(id),
  type        TEXT NOT NULL CHECK(type IN ('constraint', 'lesson', 'preference')),
  content     TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'global',
  version     INTEGER NOT NULL DEFAULT 1,
  tags        TEXT DEFAULT '[]',
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rules_repo ON rules(repo_id);
CREATE INDEX IF NOT EXISTS idx_rules_scope ON rules(scope);
CREATE INDEX IF NOT EXISTS idx_rules_type ON rules(type);
CREATE INDEX IF NOT EXISTS idx_rules_active ON rules(active);

CREATE TABLE IF NOT EXISTS graph_nodes (
  id               TEXT PRIMARY KEY,
  repo_id          TEXT NOT NULL REFERENCES repos(id),
  file_path        TEXT NOT NULL,
  language         TEXT NOT NULL,
  symbols          TEXT NOT NULL DEFAULT '[]',
  summary          TEXT DEFAULT '',
  responsibilities TEXT DEFAULT '[]',
  last_analyzed    TEXT NOT NULL,
  commit_hash      TEXT NOT NULL,
  UNIQUE(repo_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_nodes_repo ON graph_nodes(repo_id);

CREATE TABLE IF NOT EXISTS graph_edges (
  id             TEXT PRIMARY KEY,
  repo_id        TEXT NOT NULL REFERENCES repos(id),
  source         TEXT NOT NULL REFERENCES graph_nodes(id),
  target         TEXT NOT NULL REFERENCES graph_nodes(id),
  relationship   TEXT NOT NULL,
  symbols        TEXT DEFAULT '[]',
  UNIQUE(repo_id, source, target, relationship)
);

CREATE INDEX IF NOT EXISTS idx_edges_repo ON graph_edges(repo_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target);

CREATE TABLE IF NOT EXISTS manifests (
  repo_id       TEXT PRIMARY KEY REFERENCES repos(id),
  version       INTEGER NOT NULL DEFAULT 1,
  base_commit   TEXT NOT NULL,
  staged_hash   TEXT NOT NULL,
  indexed_files TEXT NOT NULL DEFAULT '[]',
  data          TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branch_snapshots (
  id            TEXT PRIMARY KEY,
  repo_id       TEXT NOT NULL REFERENCES repos(id),
  branch_name   TEXT NOT NULL,
  parent_branch TEXT,
  base_commit   TEXT NOT NULL,
  snapshot_data TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE(repo_id, branch_name)
);

CREATE TABLE IF NOT EXISTS repo_documents (
  id               TEXT PRIMARY KEY,
  repo_id          TEXT NOT NULL REFERENCES repos(id),
  file_path        TEXT NOT NULL,
  doc_type         TEXT NOT NULL,
  title            TEXT NOT NULL,
  content_hash     TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL DEFAULT 0,
  last_scanned_at  TEXT NOT NULL,
  last_modified_at TEXT NOT NULL,
  UNIQUE(repo_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_docs_repo ON repo_documents(repo_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON repo_documents(doc_type);

CREATE TABLE IF NOT EXISTS rule_versions (
  id         TEXT PRIMARY KEY,
  rule_id    TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  content    TEXT NOT NULL,
  scope      TEXT NOT NULL,
  tags       TEXT DEFAULT '[]',
  changed_at TEXT NOT NULL,
  changed_by TEXT DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON rule_versions(rule_id);

CREATE TABLE IF NOT EXISTS webhooks (
  id         TEXT PRIMARY KEY,
  url        TEXT NOT NULL,
  events     TEXT NOT NULL DEFAULT '[]',
  repo_id    TEXT REFERENCES repos(id),
  secret     TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
`;

export class StorageService {
  private db: Database.Database;

  constructor(dbPath: string) {
    try {
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.exec(SCHEMA_SQL);
    } catch (err) {
      throw new StorageError(
        `Failed to initialize database at ${dbPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  close(): void {
    this.db.close();
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  // ─── Repo Operations ───────────────────────────────────────────────

  createRepo(repo: RepoInfo): RepoInfo {
    const stmt = this.db.prepare(`
      INSERT INTO repos (id, name, path, status, languages, created_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      repo.id,
      repo.name,
      repo.path,
      repo.status,
      JSON.stringify(repo.languages),
      repo.createdAt,
      repo.lastAccessedAt,
    );
    return repo;
  }

  getRepoById(id: string): RepoInfo | null {
    const row = this.db.prepare('SELECT * FROM repos WHERE id = ?').get(id) as RepoRow | undefined;
    return row ? mapRepoRow(row) : null;
  }

  getRepoByPath(repoPath: string): RepoInfo | null {
    const row = this.db
      .prepare('SELECT * FROM repos WHERE path = ?')
      .get(repoPath) as RepoRow | undefined;
    return row ? mapRepoRow(row) : null;
  }

  listRepos(): RepoInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM repos ORDER BY last_accessed_at DESC')
      .all() as RepoRow[];
    return rows.map(mapRepoRow);
  }

  updateRepoStatus(id: string, status: RepoStatus): void {
    this.db.prepare('UPDATE repos SET status = ? WHERE id = ?').run(status, id);
  }

  updateRepoLanguages(id: string, languages: string[]): void {
    this.db
      .prepare('UPDATE repos SET languages = ? WHERE id = ?')
      .run(JSON.stringify(languages), id);
  }

  touchRepoAccess(id: string): void {
    this.db
      .prepare('UPDATE repos SET last_accessed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }

  deleteRepo(id: string): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM branch_snapshots WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM manifests WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM graph_edges WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM graph_nodes WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM rules WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM repo_documents WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM webhooks WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM repos WHERE id = ?').run(id);
    });
    transaction();
  }

  // ─── Rule Operations ───────────────────────────────────────────────

  createRule(rule: KnowledgeRule): KnowledgeRule {
    const stmt = this.db.prepare(`
      INSERT INTO rules (id, repo_id, type, content, scope, version, tags, source, created_at, updated_at, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      rule.id,
      rule.repoId,
      rule.type,
      rule.content,
      rule.scope,
      rule.version,
      JSON.stringify(rule.tags),
      rule.source,
      rule.createdAt,
      rule.updatedAt,
      rule.active ? 1 : 0,
    );
    return rule;
  }

  getRule(id: string): KnowledgeRule | null {
    const row = this.db.prepare('SELECT * FROM rules WHERE id = ?').get(id) as RuleRow | undefined;
    return row ? mapRuleRow(row) : null;
  }

  listRules(filters: {
    repoId?: string | null;
    scope?: string;
    type?: KnowledgeType;
    active?: boolean;
    includeCrossRepo?: boolean;
  }): KnowledgeRule[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.active !== undefined) {
      conditions.push('active = ?');
      params.push(filters.active ? 1 : 0);
    }

    if (filters.type) {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters.scope) {
      conditions.push('scope = ?');
      params.push(filters.scope);
    }

    if (filters.repoId !== undefined) {
      if (filters.includeCrossRepo !== false) {
        conditions.push('(repo_id = ? OR repo_id IS NULL)');
        params.push(filters.repoId);
      } else {
        conditions.push('repo_id = ?');
        params.push(filters.repoId);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM rules ${where} ORDER BY updated_at DESC`)
      .all(...params) as RuleRow[];
    return rows.map(mapRuleRow);
  }

  updateRule(
    id: string,
    updates: Partial<Pick<KnowledgeRule, 'content' | 'scope' | 'tags' | 'active'>>,
  ): KnowledgeRule | null {
    const existing = this.getRule(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    const fields: string[] = ['version = ?', 'updated_at = ?'];
    const params: unknown[] = [newVersion, now];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      params.push(updates.content);
    }
    if (updates.scope !== undefined) {
      fields.push('scope = ?');
      params.push(updates.scope);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      params.push(JSON.stringify(updates.tags));
    }
    if (updates.active !== undefined) {
      fields.push('active = ?');
      params.push(updates.active ? 1 : 0);
    }

    params.push(id);
    this.db.prepare(`UPDATE rules SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.getRule(id);
  }

  listCrossRepoRules(): KnowledgeRule[] {
    const rows = this.db
      .prepare('SELECT * FROM rules WHERE repo_id IS NULL AND scope = ? AND active = 1 ORDER BY updated_at DESC')
      .all('cross-repo') as RuleRow[];
    return rows.map(mapRuleRow);
  }

  getRulesVersionSum(repoId: string): number {
    const result = this.db
      .prepare(
        'SELECT COALESCE(SUM(version), 0) as total FROM rules WHERE (repo_id = ? OR repo_id IS NULL) AND active = 1',
      )
      .get(repoId) as { total: number };
    return result.total;
  }

  getActiveRuleCount(repoId: string): number {
    const result = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM rules WHERE (repo_id = ? OR repo_id IS NULL) AND active = 1',
      )
      .get(repoId) as { count: number };
    return result.count;
  }

  // ─── Graph Node Operations ─────────────────────────────────────────

  upsertGraphNode(node: GraphNode): GraphNode {
    const stmt = this.db.prepare(`
      INSERT INTO graph_nodes (id, repo_id, file_path, language, symbols, summary, responsibilities, last_analyzed, commit_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, file_path) DO UPDATE SET
        language = excluded.language,
        symbols = excluded.symbols,
        summary = excluded.summary,
        responsibilities = excluded.responsibilities,
        last_analyzed = excluded.last_analyzed,
        commit_hash = excluded.commit_hash
    `);
    stmt.run(
      node.id,
      node.repoId,
      node.filePath,
      node.language,
      JSON.stringify(node.symbols),
      node.summary,
      JSON.stringify(node.responsibilities),
      node.lastAnalyzed,
      node.commitHash,
    );
    return node;
  }

  getGraphNode(repoId: string, filePath: string): GraphNode | null {
    const row = this.db
      .prepare('SELECT * FROM graph_nodes WHERE repo_id = ? AND file_path = ?')
      .get(repoId, filePath) as GraphNodeRow | undefined;
    return row ? mapGraphNodeRow(row) : null;
  }

  getGraphNodeById(id: string): GraphNode | null {
    const row = this.db
      .prepare('SELECT * FROM graph_nodes WHERE id = ?')
      .get(id) as GraphNodeRow | undefined;
    return row ? mapGraphNodeRow(row) : null;
  }

  listGraphNodes(repoId: string): GraphNode[] {
    const rows = this.db
      .prepare('SELECT * FROM graph_nodes WHERE repo_id = ? ORDER BY file_path')
      .all(repoId) as GraphNodeRow[];
    return rows.map(mapGraphNodeRow);
  }

  deleteGraphNode(id: string): void {
    this.db.prepare('DELETE FROM graph_edges WHERE source = ? OR target = ?').run(id, id);
    this.db.prepare('DELETE FROM graph_nodes WHERE id = ?').run(id);
  }

  deleteGraphNodesForRepo(repoId: string): void {
    this.db.prepare('DELETE FROM graph_edges WHERE repo_id = ?').run(repoId);
    this.db.prepare('DELETE FROM graph_nodes WHERE repo_id = ?').run(repoId);
  }

  getGraphNodeCount(repoId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM graph_nodes WHERE repo_id = ?')
      .get(repoId) as { count: number };
    return result.count;
  }

  // ─── Graph Edge Operations ─────────────────────────────────────────

  upsertGraphEdge(edge: GraphEdge): GraphEdge {
    const stmt = this.db.prepare(`
      INSERT INTO graph_edges (id, repo_id, source, target, relationship, symbols)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, source, target, relationship) DO UPDATE SET
        symbols = excluded.symbols
    `);
    stmt.run(
      edge.id,
      edge.repoId,
      edge.source,
      edge.target,
      edge.relationship,
      JSON.stringify(edge.symbols),
    );
    return edge;
  }

  getEdgesFrom(nodeId: string): GraphEdge[] {
    const rows = this.db
      .prepare('SELECT * FROM graph_edges WHERE source = ?')
      .all(nodeId) as GraphEdgeRow[];
    return rows.map(mapGraphEdgeRow);
  }

  getEdgesTo(nodeId: string): GraphEdge[] {
    const rows = this.db
      .prepare('SELECT * FROM graph_edges WHERE target = ?')
      .all(nodeId) as GraphEdgeRow[];
    return rows.map(mapGraphEdgeRow);
  }

  listGraphEdges(repoId: string): GraphEdge[] {
    const rows = this.db
      .prepare('SELECT * FROM graph_edges WHERE repo_id = ?')
      .all(repoId) as GraphEdgeRow[];
    return rows.map(mapGraphEdgeRow);
  }

  deleteEdgesForNode(nodeId: string): void {
    this.db
      .prepare('DELETE FROM graph_edges WHERE source = ? OR target = ?')
      .run(nodeId, nodeId);
  }

  getGraphEdgeCount(repoId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM graph_edges WHERE repo_id = ?')
      .get(repoId) as { count: number };
    return result.count;
  }

  // ─── Manifest Operations ───────────────────────────────────────────

  upsertManifest(manifest: KBManifest): KBManifest {
    const data = JSON.stringify(manifest);
    const stmt = this.db.prepare(`
      INSERT INTO manifests (repo_id, version, base_commit, staged_hash, indexed_files, data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id) DO UPDATE SET
        version = excluded.version,
        base_commit = excluded.base_commit,
        staged_hash = excluded.staged_hash,
        indexed_files = excluded.indexed_files,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      manifest.repoId,
      manifest.version,
      manifest.baseCommit,
      manifest.stagedHash,
      JSON.stringify(manifest.indexedFiles),
      data,
      manifest.lastSyncedAt,
    );
    return manifest;
  }

  getManifest(repoId: string): KBManifest | null {
    const row = this.db
      .prepare('SELECT * FROM manifests WHERE repo_id = ?')
      .get(repoId) as ManifestRow | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as KBManifest;
  }

  // ─── Branch Snapshot Operations ────────────────────────────────────

  upsertBranchSnapshot(snapshot: BranchSnapshot): BranchSnapshot {
    const stmt = this.db.prepare(`
      INSERT INTO branch_snapshots (id, repo_id, branch_name, parent_branch, base_commit, snapshot_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, branch_name) DO UPDATE SET
        parent_branch = excluded.parent_branch,
        base_commit = excluded.base_commit,
        snapshot_data = excluded.snapshot_data
    `);
    stmt.run(
      snapshot.id,
      snapshot.repoId,
      snapshot.branchName,
      snapshot.parentBranch,
      snapshot.baseCommit,
      snapshot.snapshotData,
      snapshot.createdAt,
    );
    return snapshot;
  }

  getBranchSnapshot(repoId: string, branchName: string): BranchSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM branch_snapshots WHERE repo_id = ? AND branch_name = ?')
      .get(repoId, branchName) as BranchSnapshotRow | undefined;
    return row ? mapBranchSnapshotRow(row) : null;
  }

  deleteBranchSnapshot(repoId: string, branchName: string): void {
    this.db
      .prepare('DELETE FROM branch_snapshots WHERE repo_id = ? AND branch_name = ?')
      .run(repoId, branchName);
  }

  // ─── Document Operations ──────────────────────────────────────────

  upsertDocument(doc: RepoDocument): RepoDocument {
    const stmt = this.db.prepare(`
      INSERT INTO repo_documents (id, repo_id, file_path, doc_type, title, content_hash, size_bytes, last_scanned_at, last_modified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, file_path) DO UPDATE SET
        doc_type = excluded.doc_type,
        title = excluded.title,
        content_hash = excluded.content_hash,
        size_bytes = excluded.size_bytes,
        last_scanned_at = excluded.last_scanned_at,
        last_modified_at = excluded.last_modified_at
    `);
    stmt.run(doc.id, doc.repoId, doc.filePath, doc.docType, doc.title, doc.contentHash, doc.sizeBytes, doc.lastScannedAt, doc.lastModifiedAt);
    return doc;
  }

  getDocument(id: string): RepoDocument | null {
    const row = this.db.prepare('SELECT * FROM repo_documents WHERE id = ?').get(id) as RepoDocumentRow | undefined;
    return row ? mapRepoDocumentRow(row) : null;
  }

  listDocuments(repoId: string, docType?: string): RepoDocument[] {
    if (docType) {
      const rows = this.db.prepare('SELECT * FROM repo_documents WHERE repo_id = ? AND doc_type = ? ORDER BY file_path').all(repoId, docType) as RepoDocumentRow[];
      return rows.map(mapRepoDocumentRow);
    }
    const rows = this.db.prepare('SELECT * FROM repo_documents WHERE repo_id = ? ORDER BY doc_type, file_path').all(repoId) as RepoDocumentRow[];
    return rows.map(mapRepoDocumentRow);
  }

  deleteDocumentsForRepo(repoId: string): void {
    this.db.prepare('DELETE FROM repo_documents WHERE repo_id = ?').run(repoId);
  }

  deleteDocument(id: string): void {
    this.db.prepare('DELETE FROM repo_documents WHERE id = ?').run(id);
  }

  deleteDocumentsByPaths(repoId: string, filePaths: string[]): void {
    if (filePaths.length === 0) return;
    const placeholders = filePaths.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM repo_documents WHERE repo_id = ? AND file_path IN (${placeholders})`).run(repoId, ...filePaths);
  }

  // ─── Webhook Operations ───────────────────────────────────────────

  createWebhook(webhook: { id: string; url: string; events: string[]; repoId: string | null; secret: string | null; active: boolean; createdAt: string }): void {
    this.db.prepare('INSERT INTO webhooks (id, url, events, repo_id, secret, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(webhook.id, webhook.url, JSON.stringify(webhook.events), webhook.repoId, webhook.secret, webhook.active ? 1 : 0, webhook.createdAt);
  }

  listWebhooks(): Array<{ id: string; url: string; events: string[]; repoId: string | null; secret: string | null; active: boolean; createdAt: string }> {
    const rows = this.db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as any[];
    return rows.map(r => ({ id: r.id, url: r.url, events: JSON.parse(r.events), repoId: r.repo_id, secret: r.secret, active: r.active === 1, createdAt: r.created_at }));
  }

  deleteWebhook(id: string): void {
    this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
  }

  updateWebhookActive(id: string, active: boolean): void {
    this.db.prepare('UPDATE webhooks SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  }

  // ─── Utility ───────────────────────────────────────────────────────

  getRepoStats(repoId: string): {
    nodeCount: number;
    edgeCount: number;
    ruleCount: number;
  } {
    return {
      nodeCount: this.getGraphNodeCount(repoId),
      edgeCount: this.getGraphEdgeCount(repoId),
      ruleCount: this.getActiveRuleCount(repoId),
    };
  }

  insertRuleVersion(ruleId: string, version: number, content: string, scope: string, tags: string[], changedBy: string): void {
    this.db
      .prepare(
        `INSERT INTO rule_versions (id, rule_id, version, content, scope, tags, changed_at, changed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), ruleId, version, content, scope, JSON.stringify(tags), new Date().toISOString(), changedBy);
  }

  getRuleVersions(ruleId: string): Array<{
    id: string;
    version: number;
    content: string;
    scope: string;
    tags: string[];
    changedAt: string;
    changedBy: string;
  }> {
    const rows = this.db.prepare('SELECT * FROM rule_versions WHERE rule_id = ? ORDER BY version DESC').all(ruleId) as RuleVersionRow[];
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      content: r.content,
      scope: r.scope,
      tags: JSON.parse(r.tags) as string[],
      changedAt: r.changed_at,
      changedBy: r.changed_by,
    }));
  }

  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    return txn();
  }
}

// ─── Row Types & Mappers ──────────────────────────────────────────────

interface RepoRow {
  id: string;
  name: string;
  path: string;
  status: string;
  languages: string;
  created_at: string;
  last_accessed_at: string;
}

interface RuleRow {
  id: string;
  repo_id: string | null;
  type: string;
  content: string;
  scope: string;
  version: number;
  tags: string;
  source: string;
  created_at: string;
  updated_at: string;
  active: number;
}

interface GraphNodeRow {
  id: string;
  repo_id: string;
  file_path: string;
  language: string;
  symbols: string;
  summary: string;
  responsibilities: string;
  last_analyzed: string;
  commit_hash: string;
}

interface GraphEdgeRow {
  id: string;
  repo_id: string;
  source: string;
  target: string;
  relationship: string;
  symbols: string;
}

interface ManifestRow {
  repo_id: string;
  version: number;
  base_commit: string;
  staged_hash: string;
  indexed_files: string;
  data: string;
  updated_at: string;
}

interface BranchSnapshotRow {
  id: string;
  repo_id: string;
  branch_name: string;
  parent_branch: string | null;
  base_commit: string;
  snapshot_data: string;
  created_at: string;
}

interface RepoDocumentRow {
  id: string;
  repo_id: string;
  file_path: string;
  doc_type: string;
  title: string;
  content_hash: string;
  size_bytes: number;
  last_scanned_at: string;
  last_modified_at: string;
}

interface RuleVersionRow {
  id: string;
  rule_id: string;
  version: number;
  content: string;
  scope: string;
  tags: string;
  changed_at: string;
  changed_by: string;
}

function mapRepoRow(row: RepoRow): RepoInfo {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    status: row.status as RepoStatus,
    languages: JSON.parse(row.languages) as string[],
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
  };
}

function mapRuleRow(row: RuleRow): KnowledgeRule {
  return {
    id: row.id,
    repoId: row.repo_id,
    type: row.type as KnowledgeType,
    content: row.content,
    scope: row.scope as KnowledgeScope,
    version: row.version,
    tags: JSON.parse(row.tags) as string[],
    source: row.source as KnowledgeSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    active: row.active === 1,
  };
}

function mapGraphNodeRow(row: GraphNodeRow): GraphNode {
  return {
    id: row.id,
    repoId: row.repo_id,
    filePath: row.file_path,
    language: row.language,
    symbols: JSON.parse(row.symbols) as SymbolInfo[],
    summary: row.summary,
    responsibilities: JSON.parse(row.responsibilities) as string[],
    lastAnalyzed: row.last_analyzed,
    commitHash: row.commit_hash,
  };
}

function mapGraphEdgeRow(row: GraphEdgeRow): GraphEdge {
  return {
    id: row.id,
    repoId: row.repo_id,
    source: row.source,
    target: row.target,
    relationship: row.relationship as EdgeRelationship,
    symbols: JSON.parse(row.symbols) as string[],
  };
}

function mapBranchSnapshotRow(row: BranchSnapshotRow): BranchSnapshot {
  return {
    id: row.id,
    repoId: row.repo_id,
    branchName: row.branch_name,
    parentBranch: row.parent_branch,
    baseCommit: row.base_commit,
    snapshotData: row.snapshot_data,
    createdAt: row.created_at,
  };
}

function mapRepoDocumentRow(row: RepoDocumentRow): RepoDocument {
  return {
    id: row.id,
    repoId: row.repo_id,
    filePath: row.file_path,
    docType: row.doc_type as DocType,
    title: row.title,
    contentHash: row.content_hash,
    sizeBytes: row.size_bytes,
    lastScannedAt: row.last_scanned_at,
    lastModifiedAt: row.last_modified_at,
  };
}
