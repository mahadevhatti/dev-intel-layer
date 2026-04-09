import { simpleGit } from 'simple-git';

export interface FileMetric {
  filePath: string;
  commits30d: number;
  commits90d: number;
  lastModified: string;
  authorCount: number;
}

export class FileMetricsCollector {
  async collectMetrics(repoPath: string, files: string[]): Promise<FileMetric[]> {
    const git = simpleGit(repoPath);
    const metrics: FileMetric[] = [];

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    for (const filePath of files) {
      try {
        const log30 = await git.log({
          file: filePath,
          '--since': thirtyDaysAgo,
        } as Record<string, unknown>);
        const log90 = await git.log({
          file: filePath,
          '--since': ninetyDaysAgo,
        } as Record<string, unknown>);

        const authors = new Set<string>();
        for (const entry of log90.all) {
          if (entry.author_name) authors.add(entry.author_name);
        }

        const lastLog = await git.log({ file: filePath, maxCount: 1 });

        metrics.push({
          filePath,
          commits30d: log30.total,
          commits90d: log90.total,
          lastModified: lastLog.latest?.date ?? '',
          authorCount: authors.size,
        });
      } catch {
        metrics.push({ filePath, commits30d: 0, commits90d: 0, lastModified: '', authorCount: 0 });
      }
    }

    return metrics;
  }
}
