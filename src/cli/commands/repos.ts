import { Command } from 'commander';
import { serverFetch } from '../utils.js';

export function reposCommand(): Command {
  const cmd = new Command('repos')
    .description('Manage registered repositories');

  cmd
    .command('list')
    .alias('ls')
    .description('List all registered repos')
    .action(async () => {
      const data = await serverFetch('/api/repos');
      if (!data) return;

      if (data.repos.length === 0) {
        console.warn('No repositories registered yet.');
        console.warn('Repos are auto-registered when an AI agent connects with a repoPath.');
        return;
      }

      console.warn('\nRegistered repositories:\n');
      for (const repo of data.repos) {
        const statusIcon = repo.status === 'ready' ? '✓' : repo.status === 'scanning' ? '⟳' : '✗';
        console.warn(`  ${statusIcon} ${repo.name} (${repo.status})`);
        console.warn(`    Path: ${repo.path}`);
        console.warn(`    Languages: ${repo.languages.join(', ') || 'none detected'}`);
        console.warn(`    ID: ${repo.id.substring(0, 12)}...`);
        console.warn('');
      }
    });

  cmd
    .command('add <repoPath>')
    .description('Manually register a repository')
    .action(async (repoPath: string) => {
      const data = await serverFetch(`/api/repos/manifest?repoPath=${encodeURIComponent(repoPath)}`);
      if (data) {
        console.warn(`Repository registered or already known: ${repoPath}`);
      }
    });

  cmd
    .command('remove <repoId>')
    .description('Unregister a repository')
    .action(async (_repoId: string) => {
      console.warn('Remove not yet implemented via CLI. Use the REST API directly.');
    });

  cmd.action(() => {
    cmd.commands.find((c) => c.name() === 'list')?.parseAsync([]);
  });

  return cmd;
}
