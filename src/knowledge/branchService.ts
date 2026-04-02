import { v4 as uuidv4 } from 'uuid';
import type { BranchSnapshot } from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import { GitService } from '../git/gitService.js';

export class BranchService {
  constructor(private storage: StorageService) {}

  async createSnapshot(
    repoId: string,
    repoPath: string,
    branchName: string,
    parentBranch?: string,
  ): Promise<BranchSnapshot> {
    const git = new GitService(repoPath);
    const baseCommit = await git.getCurrentCommit();

    const rules = this.storage.listRules({ repoId, active: true, includeCrossRepo: false });
    const nodes = this.storage.listGraphNodes(repoId);

    const snapshotData = JSON.stringify({
      rules: rules.map((r) => ({ id: r.id, version: r.version, content: r.content })),
      nodeSummaries: nodes.map((n) => ({ id: n.id, summary: n.summary, filePath: n.filePath })),
    });

    const snapshot: BranchSnapshot = {
      id: uuidv4(),
      repoId,
      branchName,
      parentBranch: parentBranch ?? null,
      baseCommit,
      snapshotData,
      createdAt: new Date().toISOString(),
    };

    this.storage.upsertBranchSnapshot(snapshot);
    return snapshot;
  }

  getSnapshot(repoId: string, branchName: string): BranchSnapshot | null {
    return this.storage.getBranchSnapshot(repoId, branchName);
  }

  async handleBranchSwitch(
    repoId: string,
    repoPath: string,
    currentBranch: string,
    _newBranch: string,
  ): Promise<void> {
    const existingSnapshot = this.storage.getBranchSnapshot(repoId, currentBranch);
    if (!existingSnapshot) {
      await this.createSnapshot(repoId, repoPath, currentBranch);
    }
  }

  deleteSnapshot(repoId: string, branchName: string): void {
    this.storage.deleteBranchSnapshot(repoId, branchName);
  }
}
