import type { KBManifest } from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import { GitService } from '../git/gitService.js';
import { computeStagedHash } from './hashComputer.js';

export class ManifestService {
  constructor(private storage: StorageService) {}

  async generateManifest(
    repoId: string,
    repoPath: string,
    syncedBy: string = 'manual',
  ): Promise<KBManifest> {
    const git = new GitService(repoPath);

    const [
      currentCommit,
      branchName,
      stagedFiles,
      stagedDiff,
    ] = await Promise.all([
      git.getCurrentCommit(),
      git.getBranchName(),
      git.getStagedFiles(),
      git.getStagedDiff(),
    ]);

    const stagedHash = computeStagedHash(stagedFiles, stagedDiff);

    const nodes = this.storage.listGraphNodes(repoId);
    const indexedFiles = nodes.map((n) => n.filePath).sort();

    const stats = this.storage.getRepoStats(repoId);
    const rulesVersion = this.storage.getRulesVersionSum(repoId);

    const manifest: KBManifest = {
      repoId,
      version: 1,
      baseCommit: currentCommit,
      stagedHash,
      indexedFiles,
      indexedFileCount: indexedFiles.length,
      rulesVersion,
      rulesCount: stats.ruleCount,
      graphNodeCount: stats.nodeCount,
      graphEdgeCount: stats.edgeCount,
      lastSyncedAt: new Date().toISOString(),
      lastSyncedBy: syncedBy,
      branchName,
    };

    this.storage.upsertManifest(manifest);
    return manifest;
  }

  getManifest(repoId: string): KBManifest | null {
    return this.storage.getManifest(repoId);
  }

  async validateManifest(repoId: string, repoPath: string): Promise<{
    valid: boolean;
    currentHash: string;
    manifestHash: string | null;
    drift: boolean;
  }> {
    const git = new GitService(repoPath);
    const [stagedFiles, stagedDiff] = await Promise.all([
      git.getStagedFiles(),
      git.getStagedDiff(),
    ]);

    const currentHash = computeStagedHash(stagedFiles, stagedDiff);
    const manifest = this.storage.getManifest(repoId);

    if (!manifest) {
      return { valid: false, currentHash, manifestHash: null, drift: true };
    }

    return {
      valid: currentHash === manifest.stagedHash,
      currentHash,
      manifestHash: manifest.stagedHash,
      drift: currentHash !== manifest.stagedHash,
    };
  }
}
