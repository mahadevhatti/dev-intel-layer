// ─── Knowledge Types ────────────────────────────────────────────────

export type KnowledgeType = 'constraint' | 'lesson' | 'preference';
export type KnowledgeSource = 'manual' | 'ai-suggested';
export type KnowledgeScope = 'cross-repo' | 'global' | `branch:${string}`;

export interface KnowledgeRule {
  id: string;
  repoId: string | null;
  type: KnowledgeType;
  content: string;
  scope: KnowledgeScope;
  version: number;
  tags: string[];
  source: KnowledgeSource;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

// ─── Repo Types ─────────────────────────────────────────────────────

export type RepoStatus = 'initialized' | 'scanning' | 'ready' | 'error';

export interface RepoInfo {
  id: string;
  name: string;
  path: string;
  status: RepoStatus;
  languages: string[];
  createdAt: string;
  lastAccessedAt: string;
}

// ─── Graph Types ────────────────────────────────────────────────────

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'variable'
  | 'enum'
  | 'type'
  | 'module'
  | 'method'
  | 'property';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  range: { startLine: number; endLine: number };
  exported: boolean;
}

export type EdgeRelationship =
  | 'imports'
  | 'imported_by'
  | 'calls'
  | 'called_by'
  | 'extends'
  | 'implements';

export interface GraphNode {
  id: string;
  repoId: string;
  filePath: string;
  language: string;
  symbols: SymbolInfo[];
  summary: string;
  responsibilities: string[];
  lastAnalyzed: string;
  commitHash: string;
}

export interface GraphEdge {
  id: string;
  repoId: string;
  source: string;
  target: string;
  relationship: EdgeRelationship;
  symbols: string[];
}

// ─── Manifest Types ─────────────────────────────────────────────────

export interface KBManifest {
  repoId: string;
  version: number;
  baseCommit: string;
  stagedHash: string;
  indexedFiles: string[];
  indexedFileCount: number;
  rulesVersion: number;
  rulesCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  lastSyncedAt: string;
  lastSyncedBy: string;
  branchName: string;
}

// ─── Branch Types ───────────────────────────────────────────────────

export interface BranchSnapshot {
  id: string;
  repoId: string;
  branchName: string;
  parentBranch: string | null;
  baseCommit: string;
  snapshotData: string;
  createdAt: string;
}

export interface BranchKB {
  repoId: string;
  branchName: string;
  parentBranch: string;
  baseCommit: string;
  deltaRules: KnowledgeRule[];
  deltaNodes: GraphNode[];
  createdAt: string;
}

// ─── Conflict Types ─────────────────────────────────────────────────

export type ConflictResolution = 'keep-local' | 'accept-incoming' | 'manual';

export interface KBConflict {
  type: 'rule' | 'node';
  id: string;
  repoId: string;
  local: KnowledgeRule | GraphNode;
  incoming: KnowledgeRule | GraphNode;
  suggestedResolution: ConflictResolution;
}

// ─── Sync Types ─────────────────────────────────────────────────────

export interface SyncKBInput {
  repoPath: string;
  files?: string[];
  includeFullDiff?: boolean;
}

export interface SyncKBOutput {
  stagedFiles: string[];
  diff: string;
  affectedNodes: GraphNode[];
  existingRules: KnowledgeRule[];
  currentManifest: KBManifest;
  suggestedActions: string[];
}

export interface ApplyKBUpdatesInput {
  repoPath: string;
  nodeUpdates: {
    filePath: string;
    summary?: string;
    responsibilities?: string[];
  }[];
  ruleChanges: {
    action: 'add' | 'update' | 'deactivate';
    rule: Partial<KnowledgeRule>;
  }[];
}

// ─── Config Types ───────────────────────────────────────────────────

export interface LanguageServerConfig {
  id: string;
  name: string;
  extensions: string[];
  command: string;
  args: string[];
  installHint: string;
  initializationOptions?: Record<string, unknown>;
  enabled?: boolean;
}

export interface DILConfig {
  version: number;
  server: {
    port: number;
    host: string;
  };
  storage: {
    path: string;
    database: string;
  };
  ui: {
    autoOpen: boolean;
  };
  languageServers: Record<string, Partial<LanguageServerConfig>>;
  graph: {
    ignorePaths: string[];
    maxFileSize: number;
  };
  lspPool: {
    idleTimeoutMs: number;
  };
}

export interface RepoConfig {
  languageServers?: Record<string, Partial<LanguageServerConfig>>;
  graph?: {
    ignorePaths?: string[];
  };
  hooks?: {
    types?: string[];
  };
}

// ─── LSP Pool Types ─────────────────────────────────────────────────

export interface LSPServerInstance {
  repoId: string;
  serverId: string;
  process: import('child_process').ChildProcess;
  lastUsedAt: number;
  initialized: boolean;
}

// ─── MCP Tool Parameter Types ───────────────────────────────────────

export interface GetContextInput {
  repoPath: string;
  files?: string[];
  query?: string;
  depth?: number;
}

export interface GetContextOutput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rules: KnowledgeRule[];
  relatedFiles: string[];
}

export interface InitKBInput {
  repoPath: string;
  mode: 'current-branch' | 'main' | 'full' | 'empty';
}

export interface InitKBOutput {
  status: string;
  repoId: string;
  filesIndexed: number;
  nodesCreated: number;
  edgesCreated: number;
  manifest: KBManifest;
}
