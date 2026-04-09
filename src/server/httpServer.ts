import express, { type Express, type Request, type Response } from 'express';
import path from 'node:path';
import type { Server } from 'node:http';
import type { StorageService } from '../core/storage.js';
import type { RepoManager } from '../repo/repoManager.js';
import type { RepoRouter } from '../repo/repoRouter.js';
import type { RuleService } from '../knowledge/ruleService.js';
import type { ManifestService } from '../manifest/manifestService.js';
import type { SyncService } from '../sync/syncService.js';
import type { GraphQuery } from '../graph/graphQuery.js';
import type { DocService } from '../docs/docService.js';
import type { HealthComputer } from '../knowledge/healthScore.js';
import type { WebhookService } from './webhookService.js';
import { createApiRoutes } from './apiRoutes.js';
import { createMCPEndpoint } from './mcpEndpoint.js';
import { ActivityLog, createLoggingMiddleware, type LogSource, type LogStatus } from './activityLog.js';

export interface ServerDependencies {
  storage: StorageService;
  repoManager: RepoManager;
  repoRouter: RepoRouter;
  ruleService: RuleService;
  manifestService: ManifestService;
  syncService: SyncService;
  graphQuery: GraphQuery;
  activityLog: ActivityLog;
  docService?: DocService;
  healthComputer?: HealthComputer;
  webhookService?: WebhookService;
}

export function createHttpServer(deps: ServerDependencies): Express {
  const app = express();
  const { activityLog } = deps;

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      uptime: process.uptime(),
    });
  });

  // ─── Log Endpoints (before logging middleware to avoid self-logging) ──

  app.get('/api/logs', (req: Request, res: Response) => {
    const filters = {
      source: req.query.source as LogSource | undefined,
      action: req.query.action as string | undefined,
      repoId: req.query.repoId as string | undefined,
      status: req.query.status as LogStatus | undefined,
      search: req.query.search as string | undefined,
      since: req.query.since as string | undefined,
      until: req.query.until as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const result = activityLog.query(filters);
    res.json(result);
  });

  app.get('/api/logs/stats', (_req: Request, res: Response) => {
    res.json(activityLog.getStats());
  });

  app.get('/api/logs/stream', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: {"type":"connected"}\n\n');

    const unsubscribe = activityLog.subscribe((entry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  // ─── Session Endpoints ────────────────────────────────────────────

  app.get('/api/sessions', (_req: Request, res: Response) => {
    res.json({ sessions: activityLog.listSessions() });
  });

  app.get('/api/sessions/:sessionId', (req: Request, res: Response) => {
    const entries = activityLog.getSession(req.params.sessionId as string);
    res.json({ entries });
  });

  app.get('/api/sessions/:sessionId/delta', (req: Request, res: Response) => {
    const delta = activityLog.getSessionDelta(req.params.sessionId as string);
    res.json(delta);
  });

  // ─── Apply logging middleware to API routes ───────────────────────

  app.use('/api', createLoggingMiddleware(activityLog));

  const apiRouter = createApiRoutes(deps);
  app.use('/api', apiRouter);

  const mcpHandler = createMCPEndpoint(deps);
  app.use('/mcp', mcpHandler);

  // In dev: src/ui/dist. In production: resolve relative to package root.
  const uiDistPath = path.resolve(import.meta.dirname, '..', 'ui', 'dist');
  app.use(express.static(uiDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) {
      return next();
    }
    res.sendFile(path.join(uiDistPath, 'index.html'), (err) => {
      if (err) {
        res.status(200).json({ message: 'Cortex server running. UI not built yet.' });
      }
    });
  });

  return app;
}

export function startServer(
  app: Express,
  port: number,
  host: string,
): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      resolve(server);
    });
  });
}
