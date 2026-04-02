import type { RepoInfo } from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import type { RepoManager } from './repoManager.js';
import { RepoNotReadyError } from '../core/errors.js';

export interface RepoContext {
  repo: RepoInfo;
  storage: StorageService;
}

export class RepoRouter {
  constructor(
    private repoManager: RepoManager,
    private storage: StorageService,
  ) {}

  async resolve(repoPath: string): Promise<RepoContext> {
    const repo = await this.repoManager.resolveRepo(repoPath);

    return {
      repo,
      storage: this.storage,
    };
  }

  async resolveReady(repoPath: string): Promise<RepoContext> {
    const ctx = await this.resolve(repoPath);

    if (ctx.repo.status === 'scanning') {
      throw new RepoNotReadyError(ctx.repo.id, ctx.repo.status);
    }

    if (ctx.repo.status === 'error') {
      throw new RepoNotReadyError(ctx.repo.id, ctx.repo.status);
    }

    return ctx;
  }

  resolveById(repoId: string): RepoContext {
    const repo = this.repoManager.getRepoById(repoId);

    return {
      repo,
      storage: this.storage,
    };
  }
}
