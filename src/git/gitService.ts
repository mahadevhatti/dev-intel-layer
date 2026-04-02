import { simpleGit, type SimpleGit } from 'simple-git';

export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async getStagedFiles(): Promise<string[]> {
    const result = await this.git.diff(['--cached', '--name-only']);
    return result
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  async getStagedDiff(): Promise<string> {
    return this.git.diff(['--cached']);
  }

  async getCurrentCommit(): Promise<string> {
    const result = await this.git.revparse(['HEAD']);
    return result.trim();
  }

  async getBranchName(): Promise<string> {
    const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  }

  async getChangedFilesSince(commitHash: string): Promise<string[]> {
    const result = await this.git.diff(['--name-only', commitHash]);
    return result
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  async isInsideWorkTree(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  async getRepoRoot(): Promise<string> {
    const result = await this.git.revparse(['--show-toplevel']);
    return result.trim();
  }

  async getTrackedFiles(): Promise<string[]> {
    const result = await this.git.raw(['ls-files']);
    return result
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  async getStatus() {
    return this.git.status();
  }
}
