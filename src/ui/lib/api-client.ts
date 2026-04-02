const BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Health ─────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export const fetchHealth = () => request<HealthResponse>('/health');

// ─── Repos ──────────────────────────────────────────────────────────

export interface RepoInfo {
  id: string;
  name: string;
  path: string;
  status: 'initialized' | 'scanning' | 'ready' | 'error';
  languages: string[];
  createdAt: string;
  lastAccessedAt: string;
}

export interface RepoStats {
  nodeCount: number;
  edgeCount: number;
  ruleCount: number;
}

export const fetchRepos = () =>
  request<{ repos: RepoInfo[] }>('/repos').then((r) => r.repos);

export const fetchRepoDetail = (repoId: string) =>
  request<{ repo: RepoInfo; manifest: Manifest | null; stats: RepoStats }>(`/repos/${repoId}`);

export const fetchRepoStats = (repoId: string) =>
  request<RepoStats>(`/repos/${repoId}/stats`);

// ─── Graph ──────────────────────────────────────────────────────────

export interface SymbolInfo {
  name: string;
  kind: string;
  range: { startLine: number; endLine: number };
  exported: boolean;
}

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
  relationship: string;
  symbols: string[];
}

export const fetchGraph = (repoId: string) =>
  request<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/repos/${repoId}/graph`);

// ─── Rules ──────────────────────────────────────────────────────────

export interface KnowledgeRule {
  id: string;
  repoId: string | null;
  type: 'constraint' | 'lesson' | 'preference';
  content: string;
  scope: string;
  version: number;
  tags: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export const fetchRules = (repoId: string) =>
  request<{ rules: KnowledgeRule[] }>(`/repos/${repoId}/rules`).then((r) => r.rules);

export const fetchCrossRepoRules = () =>
  request<{ rules: KnowledgeRule[] }>('/rules/cross-repo').then((r) => r.rules);

export const createRule = (repoId: string, data: { type: string; content: string; scope?: string; tags?: string[] }) =>
  request<{ rule: KnowledgeRule }>(`/repos/${repoId}/rules`, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((r) => r.rule);

export const updateRule = (repoId: string, ruleId: string, data: Partial<KnowledgeRule>) =>
  request<{ rule: KnowledgeRule }>(`/repos/${repoId}/rules/${ruleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }).then((r) => r.rule);

export const createCrossRepoRule = (data: { type: string; content: string; tags?: string[] }) =>
  request<{ rule: KnowledgeRule }>('/rules/cross-repo', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then((r) => r.rule);

// ─── Manifest ───────────────────────────────────────────────────────

export interface Manifest {
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

export const fetchManifest = (repoId: string) =>
  request<{ manifest: Manifest | null }>(`/repos/${repoId}/manifest`).then((r) => r.manifest);

// ─── Context ────────────────────────────────────────────────────────

export interface ContextResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rules: KnowledgeRule[];
  relatedFiles: string[];
}

export const fetchContext = (repoId: string, file: string) =>
  request<ContextResult>(`/repos/${repoId}/context?file=${encodeURIComponent(file)}`);
