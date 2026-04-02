import express, { type Express } from 'express';
import path from 'node:path';
import type { Server } from 'node:http';
import type { StorageService } from '../core/storage.js';
import type { RepoManager } from '../repo/repoManager.js';
import type { RepoRouter } from '../repo/repoRouter.js';
import type { RuleService } from '../knowledge/ruleService.js';
import type { ManifestService } from '../manifest/manifestService.js';
import type { SyncService } from '../sync/syncService.js';
import type { GraphQuery } from '../graph/graphQuery.js';
import { createApiRoutes } from './apiRoutes.js';
import { createMCPEndpoint } from './mcpEndpoint.js';

export interface ServerDependencies {
  storage: StorageService;
  repoManager: RepoManager;
  repoRouter: RepoRouter;
  ruleService: RuleService;
  manifestService: ManifestService;
  syncService: SyncService;
  graphQuery: GraphQuery;
}

export function createHttpServer(deps: ServerDependencies): Express {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.1.0',
      uptime: process.uptime(),
    });
  });

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
        res.status(200).json({ message: 'DIL server running. UI not built yet.' });
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
