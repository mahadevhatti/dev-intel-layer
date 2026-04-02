import type { SyncKBOutput, GraphNode, KBManifest } from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import { GitService } from '../git/gitService.js';
import { GraphQuery } from '../graph/graphQuery.js';
import { parseDiffStat } from '../git/diffParser.js';

export class SyncCollector {
  private graphQuery: GraphQuery;

  constructor(private storage: StorageService) {
    this.graphQuery = new GraphQuery(storage);
  }

  async collect(
    repoId: string,
    repoPath: string,
    files?: string[],
    includeFullDiff?: boolean,
  ): Promise<SyncKBOutput> {
    const git = new GitService(repoPath);

    const [allStagedFiles, fullDiff] = await Promise.all([
      git.getStagedFiles(),
      git.getStagedDiff(),
    ]);

    const targetFiles = files ?? allStagedFiles;
    const stagedFiles = files
      ? allStagedFiles.filter((f) => files.includes(f))
      : allStagedFiles;

    const diff = includeFullDiff !== false ? fullDiff : '';

    const affectedNodes: GraphNode[] = [];
    for (const file of targetFiles) {
      const node = this.graphQuery.getNode(repoId, file);
      if (node) affectedNodes.push(node);
    }

    const existingRules = this.storage.listRules({
      repoId,
      active: true,
      includeCrossRepo: true,
    });

    const manifest = this.storage.getManifest(repoId);
    const currentManifest: KBManifest = manifest ?? {
      repoId,
      version: 1,
      baseCommit: '',
      stagedHash: '',
      indexedFiles: [],
      indexedFileCount: 0,
      rulesVersion: 0,
      rulesCount: 0,
      graphNodeCount: 0,
      graphEdgeCount: 0,
      lastSyncedAt: new Date().toISOString(),
      lastSyncedBy: 'none',
      branchName: 'unknown',
    };

    const suggestedActions = this.generateSuggestions(targetFiles, fullDiff, affectedNodes);

    return {
      stagedFiles,
      diff,
      affectedNodes,
      existingRules,
      currentManifest,
      suggestedActions,
    };
  }

  private generateSuggestions(
    files: string[],
    diff: string,
    existingNodes: GraphNode[],
  ): string[] {
    const suggestions: string[] = [];

    const diffFiles = parseDiffStat(diff);
    const newFiles = diffFiles.filter((f) => f.status === 'added');
    const deletedFiles = diffFiles.filter((f) => f.status === 'deleted');

    for (const f of newFiles) {
      suggestions.push(`New file: ${f.filePath} — add to graph with summary`);
    }

    for (const f of deletedFiles) {
      suggestions.push(`Deleted file: ${f.filePath} — remove from graph`);
    }

    for (const node of existingNodes) {
      if (!node.summary) {
        suggestions.push(`${node.filePath} has no summary — consider adding one`);
      }
    }

    const unindexedFiles = files.filter(
      (f) => !existingNodes.some((n) => n.filePath === f),
    );
    for (const f of unindexedFiles) {
      if (!deletedFiles.some((d) => d.filePath === f)) {
        suggestions.push(`${f} is not in the graph — will be added`);
      }
    }

    return suggestions;
  }
}
