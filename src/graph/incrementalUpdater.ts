import type { GraphNode } from '../core/types.js';
import type { StorageService } from '../core/storage.js';

export class IncrementalUpdater {
  constructor(private storage: StorageService) {}

  updateNodeSummaries(
    repoId: string,
    updates: { filePath: string; summary?: string; responsibilities?: string[] }[],
  ): number {
    let updated = 0;
    for (const update of updates) {
      const node = this.storage.getGraphNode(repoId, update.filePath);
      if (!node) continue;

      const updatedNode: GraphNode = {
        ...node,
        summary: update.summary ?? node.summary,
        responsibilities: update.responsibilities ?? node.responsibilities,
        lastAnalyzed: new Date().toISOString(),
      };

      this.storage.upsertGraphNode(updatedNode);
      updated++;
    }
    return updated;
  }

  removeDeletedFiles(repoId: string, deletedFiles: string[]): number {
    let removed = 0;
    for (const filePath of deletedFiles) {
      const nodeId = `${repoId}:${filePath}`;
      const node = this.storage.getGraphNodeById(nodeId);
      if (node) {
        this.storage.deleteGraphNode(nodeId);
        removed++;
      }
    }
    return removed;
  }
}
