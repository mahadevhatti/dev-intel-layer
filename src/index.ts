// Core
export { StorageService } from './core/storage.js';
export { loadCentralConfig, getDatabasePath, ensureStorageDir, getLanguageServerConfigs } from './core/config.js';
export * from './core/types.js';
export * from './core/errors.js';

// Repo
export { RepoManager, computeRepoId } from './repo/repoManager.js';
export { RepoRouter } from './repo/repoRouter.js';

// Git
export { GitService } from './git/gitService.js';
export { parseDiffStat, extractAffectedSymbols } from './git/diffParser.js';
export { installHooks, uninstallHooks } from './git/hookInstaller.js';

// LSP
export { LanguageServerRegistry } from './lsp/registry.js';
export { LSPServerPool } from './lsp/serverPool.js';

// Graph
export { GraphBuilder } from './graph/graphBuilder.js';
export { GraphQuery } from './graph/graphQuery.js';
export { IncrementalUpdater } from './graph/incrementalUpdater.js';

// Knowledge
export { RuleService } from './knowledge/ruleService.js';
export { BranchService } from './knowledge/branchService.js';
export { ConflictResolver } from './knowledge/conflictResolver.js';

// Manifest
export { ManifestService } from './manifest/manifestService.js';
export { computeStagedHash, computeContentHash } from './manifest/hashComputer.js';

// Sync
export { SyncService } from './sync/syncService.js';
export { SyncCollector } from './sync/syncCollector.js';

// Server
export { createHttpServer, startServer } from './server/httpServer.js';
