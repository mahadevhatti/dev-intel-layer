import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RepoInfo, RepoStatus } from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import { RepoNotFoundError, RepoAlreadyExistsError, NotAGitRepoError } from '../core/errors.js';
import { simpleGit, type SimpleGit } from 'simple-git';

export function computeRepoId(absolutePath: string): string {
  return crypto.createHash('sha256').update(absolutePath).digest('hex');
}

export class RepoManager {
  constructor(private storage: StorageService) {}

  private normalizePath(p: string): string {
    const resolved = path.resolve(p);
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }

  async registerRepo(repoPath: string): Promise<RepoInfo> {
    const absolutePath = this.normalizePath(repoPath);
    const existing = this.storage.getRepoByPath(absolutePath);
    if (existing) {
      throw new RepoAlreadyExistsError(absolutePath);
    }

    const git: SimpleGit = simpleGit(absolutePath);
    const isGit = await git.checkIsRepo();
    if (!isGit) {
      throw new NotAGitRepoError(absolutePath);
    }

    const repoRoot = await git.revparse(['--show-toplevel']);
    const normalizedRoot = this.normalizePath(repoRoot.trim());

    const repoId = computeRepoId(normalizedRoot);
    const repoName = path.basename(normalizedRoot);
    const now = new Date().toISOString();

    const repo: RepoInfo = {
      id: repoId,
      name: repoName,
      path: normalizedRoot,
      status: 'initialized',
      languages: [],
      createdAt: now,
      lastAccessedAt: now,
    };

    this.storage.createRepo(repo);
    return repo;
  }

  getRepoById(id: string): RepoInfo {
    const repo = this.storage.getRepoById(id);
    if (!repo) throw new RepoNotFoundError(id);
    this.storage.touchRepoAccess(id);
    return repo;
  }

  getRepoByPath(repoPath: string): RepoInfo | null {
    const absolutePath = this.normalizePath(repoPath);
    const repo = this.storage.getRepoByPath(absolutePath);
    if (repo) {
      this.storage.touchRepoAccess(repo.id);
    }
    return repo;
  }

  listRepos(): RepoInfo[] {
    return this.storage.listRepos();
  }

  updateStatus(repoId: string, status: RepoStatus): void {
    this.storage.updateRepoStatus(repoId, status);
  }

  updateLanguages(repoId: string, languages: string[]): void {
    this.storage.updateRepoLanguages(repoId, languages);
  }

  removeRepo(repoId: string): void {
    const repo = this.storage.getRepoById(repoId);
    if (!repo) throw new RepoNotFoundError(repoId);
    this.storage.deleteRepo(repoId);
  }

  async resolveRepo(repoPath: string): Promise<RepoInfo> {
    const absolutePath = this.normalizePath(repoPath);

    const existing = this.storage.getRepoByPath(absolutePath);
    if (existing) {
      this.storage.touchRepoAccess(existing.id);
      return existing;
    }

    return this.registerRepo(absolutePath);
  }

  async detectLanguages(repoPath: string): Promise<string[]> {
    const extensionMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.py': 'python',
      '.pyi': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.swift': 'swift',
      '.kt': 'kotlin',
    };

    const git: SimpleGit = simpleGit(repoPath);
    const filesStr = await git.raw(['ls-files']);
    const files = filesStr.trim().split('\n').filter(Boolean);

    const languages = new Set<string>();
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const lang = extensionMap[ext];
      if (lang) languages.add(lang);
    }

    return [...languages].sort();
  }
}
