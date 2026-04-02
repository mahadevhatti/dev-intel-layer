import { Command } from 'commander';
import path from 'node:path';
import { serverFetch } from '../utils.js';

export function statusCommand(): Command {
  return new Command('status')
    .argument('<repoPath>', 'Path to repository')
    .description('Show KB status and manifest for a repository')
    .action(async (repoPath: string) => {
      const absolutePath = path.resolve(repoPath);
      const data = await serverFetch(`/api/repos/manifest?repoPath=${encodeURIComponent(absolutePath)}`);
      if (!data) return;

      if (data.stagedHash === 'UNKNOWN') {
        console.warn(`Repository not registered: ${absolutePath}`);
        return;
      }

      console.warn('\nManifest Status:');
      console.warn(`  Branch:      ${data.branchName}`);
      console.warn(`  Base Commit: ${data.baseCommit?.substring(0, 8)}`);
      console.warn(`  Staged Hash: ${data.stagedHash?.substring(0, 16)}...`);
      console.warn(`  Files:       ${data.indexedFileCount}`);
      console.warn(`  Nodes:       ${data.graphNodeCount}`);
      console.warn(`  Edges:       ${data.graphEdgeCount}`);
      console.warn(`  Rules:       ${data.rulesCount}`);
      console.warn(`  Last Synced: ${data.lastSyncedAt}`);
    });
}
