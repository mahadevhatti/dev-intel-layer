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
  provenance?: {
    sessionId?: string;
    triggeredByFile?: string;
    triggeredByDiff?: string;
    createdVia: 'mcp' | 'rest' | 'manual';
  };
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

export const fetchContext = (repoId: string, file: string, depth?: number) =>
  request<ContextResult>(`/repos/${repoId}/context?file=${encodeURIComponent(file)}${depth ? `&depth=${depth}` : ''}`);

// ─── Graph Build ─────────────────────────────────────────────────────

export interface GraphBuildResult {
  nodesCreated: number;
  edgesCreated: number;
  filesScanned: number;
  manifest: Manifest;
}

export const buildRepoGraph = (repoId: string) =>
  request<GraphBuildResult>(`/repos/${repoId}/graph/build`, { method: 'POST', body: JSON.stringify({}) });

// ─── Logs ────────────────────────────────────────────────────────────

export type LogSource = 'mcp' | 'rest' | 'hook' | 'internal';
export type LogStatus = 'success' | 'error';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  source: LogSource;
  action: string;
  repoId: string | null;
  sessionId: string | null;
  durationMs: number;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  status: LogStatus;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
}

export interface LogFilters {
  source?: string;
  action?: string;
  repoId?: string;
  status?: string;
  search?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface LogStats {
  totalEntries: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number;
  topTools: { action: string; count: number }[];
  topRepos: { repoId: string; count: number }[];
  callsBySource: Record<string, number>;
}

export const fetchLogs = (filters: LogFilters) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const q = params.toString();
  return request<{ entries: ActivityLogEntry[]; total: number }>(q ? `/logs?${q}` : '/logs');
};

export const fetchLogStats = () => request<LogStats>('/logs/stats');

// ─── Documents ──────────────────────────────────────────────────────

export type DocType = 'cursor-rule' | 'agent-guide' | 'contributing' | 'readme' | 'architecture' | 'adr' | 'changelog' | 'docs' | 'other';

export interface RepoDocument {
  id: string;
  repoId: string;
  filePath: string;
  docType: DocType;
  title: string;
  contentHash: string;
  sizeBytes: number;
  lastScannedAt: string;
  lastModifiedAt: string;
}

export const fetchDocs = (repoId: string, docType?: string) =>
  request<{ docs: RepoDocument[] }>(`/repos/${repoId}/docs${docType ? `?type=${docType}` : ''}`).then(r => r.docs);

export const fetchDocContent = (repoId: string, docId: string) =>
  request<{ content: string }>(`/repos/${repoId}/docs/${docId}/content`).then(r => r.content);

export const fetchDocReferences = (repoId: string, docId: string) =>
  request<{ references: string[] }>(`/repos/${repoId}/docs/${docId}/references`).then(r => r.references);

export const scanDocs = (repoId: string) =>
  request<{ added: number; updated: number; removed: number }>(`/repos/${repoId}/docs/scan`, { method: 'POST', body: JSON.stringify({}) });

// ─── Sessions ───────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  firstSeen: string;
  lastSeen: string;
  toolCount: number;
  repos: string[];
  hasErrors: boolean;
}

export interface SessionDelta {
  rulesAdded: number;
  rulesUpdated: number;
  nodesUpdated: number;
  writeActions: string[];
}

export const fetchSessions = () =>
  request<{ sessions: SessionSummary[] }>('/sessions').then(r => r.sessions);

export const fetchSession = (sessionId: string) =>
  request<{ entries: ActivityLogEntry[] }>(`/sessions/${sessionId}`).then(r => r.entries);

export const fetchSessionDelta = (sessionId: string) =>
  request<SessionDelta>(`/sessions/${sessionId}/delta`);

// ─── Search ─────────────────────────────────────────────────────────

export interface SearchResults {
  rules: KnowledgeRule[];
  nodes: GraphNode[];
  docs: RepoDocument[];
}

export const searchAll = (query: string, limit = 20) =>
  request<SearchResults>(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);

// ─── Health ─────────────────────────────────────────────────────────

export interface HealthBreakdown {
  factor: string;
  score: number;
  weight: number;
  detail: string;
}

export interface RepoHealthScore {
  score: number;
  breakdown: HealthBreakdown[];
  suggestions: string[];
}

export const fetchRepoHealth = (repoId: string) =>
  request<RepoHealthScore>(`/repos/${repoId}/health`);

// ─── Analytics ──────────────────────────────────────────────────────

export interface AnalyticsData {
  aggregate: {
    totalNodes: number;
    totalEdges: number;
    totalRules: number;
    totalRepos: number;
    totalActivity: number;
  };
  repoSummaries: { repoId: string; name: string; healthScore: number; activityCount: number }[];
  activityTrend: { hour: string; count: number }[];
}

export const fetchAnalytics = () => request<AnalyticsData>('/analytics');

// ─── Webhooks ───────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  repoId: string | null;
  secret: string | null;
  active: boolean;
  createdAt: string;
}

export const fetchWebhooks = () =>
  request<{ webhooks: Webhook[] }>('/webhooks').then(r => r.webhooks);

export const createWebhook = (data: { url: string; events: string[]; repoId?: string; secret?: string }) =>
  request<{ webhook: Webhook }>('/webhooks', { method: 'POST', body: JSON.stringify(data) }).then(r => r.webhook);

export const deleteWebhook = async (id: string): Promise<void> => {
  const res = await fetch(`${BASE}/webhooks/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message || `Request failed: ${res.status}`);
  }
};

export const toggleWebhook = (id: string, active: boolean) =>
  request<{ webhook: Webhook }>(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify({ active }) }).then(r => r.webhook);

// ─── Graph Metrics ──────────────────────────────────────────────────

export interface FileMetrics {
  filePath: string;
  commits30d: number;
  commits90d: number;
  lastModified: string;
  authorCount: number;
}

export const fetchGraphMetrics = (repoId: string) =>
  request<{ metrics: FileMetrics[] }>(`/repos/${repoId}/graph/metrics`).then(r => r.metrics);
