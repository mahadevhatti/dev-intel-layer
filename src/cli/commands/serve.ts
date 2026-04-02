import { Command } from 'commander';
import { loadCentralConfig, getDatabasePath, ensureStorageDir } from '../../core/config.js';
import { StorageService } from '../../core/storage.js';
import { RepoManager } from '../../repo/repoManager.js';
import { RepoRouter } from '../../repo/repoRouter.js';
import { RuleService } from '../../knowledge/ruleService.js';
import { ManifestService } from '../../manifest/manifestService.js';
import { SyncService } from '../../sync/syncService.js';
import { GraphQuery } from '../../graph/graphQuery.js';
import { createHttpServer, startServer } from '../../server/httpServer.js';

export function serveCommand(): Command {
  return new Command('serve')
    .description('Start the Cortex central server')
    .option('-p, --port <port>', 'Port to listen on')
    .option('--no-ui', 'Do not auto-open browser')
    .action(async (opts) => {
      const config = loadCentralConfig();
      const port = opts.port ? parseInt(opts.port) : config.server.port;

      ensureStorageDir(config);
      const dbPath = getDatabasePath(config);

      console.warn(`[Cortex] Initializing database at ${dbPath}`);
      const storage = new StorageService(dbPath);

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

      const server = await startServer(app, port, config.server.host);

      console.warn(`[Cortex] Server running at http://${config.server.host}:${port}`);
      console.warn(`[Cortex]   MCP endpoint: http://${config.server.host}:${port}/mcp`);
      console.warn(`[Cortex]   REST API:     http://${config.server.host}:${port}/api`);
      console.warn(`[Cortex]   Web UI:       http://${config.server.host}:${port}/`);

      if (opts.ui !== false && config.ui.autoOpen) {
        const { exec } = await import('node:child_process');
        const url = `http://${config.server.host}:${port}`;
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${cmd} ${url}`);
      }

      const shutdown = () => {
        console.warn('\n[Cortex] Shutting down...');
        server.close();
        storage.close();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}
