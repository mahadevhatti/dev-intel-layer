import { Command } from 'commander';
import path from 'node:path';
import { installHooks, uninstallHooks } from '../../git/hookInstaller.js';

export function hooksCommand(): Command {
  const cmd = new Command('hooks')
    .description('Manage Git hooks');

  cmd
    .command('install <repoPath>')
    .alias('install-hooks')
    .description('Install Cortex Git hooks in a repository')
    .action((repoPath: string) => {
      const absolutePath = path.resolve(repoPath);
      const result = installHooks(absolutePath);

      if (result.installed.length > 0) {
        console.warn(`Installed hooks: ${result.installed.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        console.warn(`Skipped (existing non-Cortex hooks): ${result.skipped.join(', ')}`);
      }
    });

  cmd
    .command('uninstall <repoPath>')
    .alias('uninstall-hooks')
    .description('Remove Cortex Git hooks from a repository')
    .action((repoPath: string) => {
      const absolutePath = path.resolve(repoPath);
      const result = uninstallHooks(absolutePath);

      if (result.removed.length > 0) {
        console.warn(`Removed hooks: ${result.removed.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        console.warn(`Skipped: ${result.skipped.join(', ')}`);
      }
    });

  return cmd;
}
