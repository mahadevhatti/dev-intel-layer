import { Command } from 'commander';
import path from 'node:path';
import { serverFetch } from '../utils.js';

export function checkCommand(): Command {
  return new Command('check')
    .argument('<repoPath>', 'Path to repository')
    .description('Validate manifest against staged changes')
    .action(async (repoPath: string) => {
      const absolutePath = path.resolve(repoPath);
      const data = await serverFetch(`/api/repos/manifest?repoPath=${encodeURIComponent(absolutePath)}`);
      if (!data) return;

      if (data.stagedHash === 'UNKNOWN') {
        console.warn(`Repository not registered with Cortex: ${absolutePath}`);
        process.exitCode = 1;
        return;
      }

      console.warn(`Manifest hash: ${data.stagedHash?.substring(0, 16)}...`);
      console.warn('Use the pre-commit hook for full validation.');
    });
}
