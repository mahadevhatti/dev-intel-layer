import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// ─── Types ──────────────────────────────────────────────────────────

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
  source?: LogSource;
  action?: string;
  repoId?: string;
  status?: LogStatus;
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
  callsBySource: Record<LogSource, number>;
}

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

type LogListener = (entry: ActivityLogEntry) => void;

// ─── ActivityLog ────────────────────────────────────────────────────

export class ActivityLog {
  private entries: ActivityLogEntry[] = [];
  private maxEntries: number;
  private listeners = new Set<LogListener>();

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  log(partial: Omit<ActivityLogEntry, 'id' | 'timestamp'>): ActivityLogEntry {
    const entry: ActivityLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...partial,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }

    for (const listener of this.listeners) {
      try { listener(entry); } catch { /* ignore listener errors */ }
    }

    return entry;
  }

  query(filters: LogFilters): { entries: ActivityLogEntry[]; total: number } {
    let results = this.entries;

    if (filters.source) {
      results = results.filter(e => e.source === filters.source);
    }
    if (filters.action) {
      results = results.filter(e => e.action.includes(filters.action!));
    }
    if (filters.repoId) {
      results = results.filter(e => e.repoId === filters.repoId);
    }
    if (filters.status) {
      results = results.filter(e => e.status === filters.status);
    }
    if (filters.since) {
      results = results.filter(e => e.timestamp >= filters.since!);
    }
    if (filters.until) {
      results = results.filter(e => e.timestamp <= filters.until!);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      results = results.filter(e =>
        e.action.toLowerCase().includes(term) ||
        JSON.stringify(e.request).toLowerCase().includes(term) ||
        JSON.stringify(e.response).toLowerCase().includes(term) ||
        (e.errorMessage?.toLowerCase().includes(term) ?? false)
      );
    }

    const total = results.length;

    // Return newest first
    results = [...results].reverse();

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    results = results.slice(offset, offset + limit);

    return { entries: results, total };
  }

  getStats(): LogStats {
    const totalEntries = this.entries.length;
    const errorCount = this.entries.filter(e => e.status === 'error').length;
    const errorRate = totalEntries > 0 ? errorCount / totalEntries : 0;
    const avgDurationMs = totalEntries > 0
      ? this.entries.reduce((sum, e) => sum + e.durationMs, 0) / totalEntries
      : 0;

    const toolCounts = new Map<string, number>();
    const repoCounts = new Map<string, number>();
    const sourceCounts: Record<LogSource, number> = { mcp: 0, rest: 0, hook: 0, internal: 0 };

    for (const entry of this.entries) {
      toolCounts.set(entry.action, (toolCounts.get(entry.action) ?? 0) + 1);
      if (entry.repoId) {
        repoCounts.set(entry.repoId, (repoCounts.get(entry.repoId) ?? 0) + 1);
      }
      sourceCounts[entry.source]++;
    }

    const topTools = [...toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    const topRepos = [...repoCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([repoId, count]) => ({ repoId, count }));

    return { totalEntries, errorCount, errorRate, avgDurationMs, topTools, topRepos, callsBySource: sourceCounts };
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ─── Session queries (used by Phase 3, but defined here) ────────

  listSessions(): SessionSummary[] {
    const sessionMap = new Map<string, ActivityLogEntry[]>();
    for (const entry of this.entries) {
      if (!entry.sessionId) continue;
      const list = sessionMap.get(entry.sessionId) ?? [];
      list.push(entry);
      sessionMap.set(entry.sessionId, list);
    }

    return [...sessionMap.entries()].map(([sessionId, entries]) => {
      const sorted = entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const repos = [...new Set(entries.filter(e => e.repoId).map(e => e.repoId!))];
      return {
        sessionId,
        firstSeen: sorted[0].timestamp,
        lastSeen: sorted[sorted.length - 1].timestamp,
        toolCount: entries.length,
        repos,
        hasErrors: entries.some(e => e.status === 'error'),
      };
    }).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  getSession(sessionId: string): ActivityLogEntry[] {
    return this.entries
      .filter(e => e.sessionId === sessionId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  getSessionDelta(sessionId: string): SessionDelta {
    const entries = this.getSession(sessionId);
    const writeActions: string[] = [];
    let rulesAdded = 0;
    let rulesUpdated = 0;
    let nodesUpdated = 0;

    for (const entry of entries) {
      if (entry.status === 'error') continue;
      if (entry.action === 'add_rule' || entry.action === 'POST /api/repos/:repoId/rules') {
        rulesAdded++;
        writeActions.push(entry.action);
      } else if (entry.action === 'update_rule' || entry.action.startsWith('PUT /api/repos/')) {
        rulesUpdated++;
        writeActions.push(entry.action);
      } else if (entry.action === 'apply_kb_updates') {
        const nodeCount = (entry.request.nodeUpdates as unknown[] | undefined)?.length ?? 0;
        const ruleChanges = (entry.request.ruleChanges as Array<{ action: string }> | undefined) ?? [];
        nodesUpdated += nodeCount;
        rulesAdded += ruleChanges.filter(r => r.action === 'add').length;
        rulesUpdated += ruleChanges.filter(r => r.action === 'update' || r.action === 'deactivate').length;
        writeActions.push(entry.action);
      }
    }

    return { rulesAdded, rulesUpdated, nodesUpdated, writeActions: [...new Set(writeActions)] };
  }
}

// ─── Express Logging Middleware ─────────────────────────────────────

function truncateObject(obj: unknown, maxDepth = 3, maxStringLen = 500): unknown {
  if (maxDepth <= 0) return '[truncated]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj.length > maxStringLen ? obj.slice(0, maxStringLen) + '...' : obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    if (obj.length > 20) return [...obj.slice(0, 20).map(i => truncateObject(i, maxDepth - 1, maxStringLen)), `...+${obj.length - 20} more`];
    return obj.map(i => truncateObject(i, maxDepth - 1, maxStringLen));
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = truncateObject(value, maxDepth - 1, maxStringLen);
  }
  return result;
}

function extractRepoId(req: Request): string | null {
  const repoId = req.params.repoId;
  if (typeof repoId === 'string') return repoId;
  return null;
}

export function createLoggingMiddleware(activityLog: ActivityLog) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip logging for log/stream/health endpoints to avoid recursion
    if (req.path.includes('/logs') || req.path.includes('/health') || req.path.includes('/search') || req.path.includes('/analytics')) {
      return next();
    }

    const startTime = Date.now();
    const originalJson = res.json.bind(res);

    let responseBody: unknown = null;
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const isError = res.statusCode >= 400;

      activityLog.log({
        source: 'rest',
        action: `${req.method} ${req.route?.path ?? req.path}`,
        repoId: extractRepoId(req),
        sessionId: null,
        durationMs,
        request: truncateObject({ query: req.query, body: req.body, params: req.params }) as Record<string, unknown>,
        response: truncateObject(responseBody) as Record<string, unknown> ?? {},
        status: isError ? 'error' : 'success',
        errorMessage: isError ? (responseBody as Record<string, unknown>)?.message as string ?? null : null,
        metadata: { statusCode: res.statusCode, method: req.method, path: req.path },
      });
    });

    next();
  };
}

// ─── MCP Tool Logging Wrapper ──────────────────────────────────────

export function wrapMCPToolHandler<TParams extends Record<string, unknown>, TResult>(
  activityLog: ActivityLog,
  toolName: string,
  handler: (params: TParams, extra: { sessionId?: string }) => Promise<TResult>,
): (params: TParams, extra: { sessionId?: string }) => Promise<TResult> {
  return async (params: TParams, extra: { sessionId?: string }) => {
    const startTime = Date.now();
    let repoId: string | null = null;

    if ('repoPath' in params && typeof params.repoPath === 'string') {
      // We'll capture repoId from the response if possible
    }

    try {
      const result = await handler(params, extra);
      const durationMs = Date.now() - startTime;

      // Try to extract repoId from result
      const resultText = (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
      if (resultText) {
        try {
          const parsed = JSON.parse(resultText);
          repoId = parsed?.repo?.id ?? parsed?.repoId ?? parsed?.manifest?.repoId ?? null;
        } catch { /* not JSON */ }
      }

      activityLog.log({
        source: 'mcp',
        action: toolName,
        repoId,
        sessionId: extra?.sessionId ?? null,
        durationMs,
        request: truncateObject(params) as Record<string, unknown>,
        response: truncateObject(result) as Record<string, unknown> ?? {},
        status: 'success',
        errorMessage: null,
        metadata: {},
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      activityLog.log({
        source: 'mcp',
        action: toolName,
        repoId,
        sessionId: extra?.sessionId ?? null,
        durationMs,
        request: truncateObject(params) as Record<string, unknown>,
        response: {},
        status: 'error',
        errorMessage,
        metadata: {},
      });

      throw err;
    }
  };
}
