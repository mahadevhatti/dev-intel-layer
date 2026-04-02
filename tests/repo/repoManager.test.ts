import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { StorageService } from '../../src/core/storage.js';
import { RepoManager, computeRepoId } from '../../src/repo/repoManager.js';
import { RepoAlreadyExistsError, NotAGitRepoError, RepoNotFoundError } from '../../src/core/errors.js';

let storage: StorageService;
let repoManager: RepoManager;
let tmpDir: string;
let dbPath: string;
let gitRepoPath: string;

function createTempGitRepo(): string {
  const repoDir = path.join(tmpDir, 'git-repo');
  fs.mkdirSync(repoDir, { recursive: true });
  execSync('git init', { cwd: repoDir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: repoDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: repoDir, stdio: 'ignore' });

  fs.writeFileSync(path.join(repoDir, 'index.ts'), 'export const hello = "world";');
  fs.writeFileSync(path.join(repoDir, 'utils.py'), 'def greet(): pass');
  execSync('git add . && git commit -m "init"', { cwd: repoDir, stdio: 'ignore' });

  return repoDir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-repo-test-'));
  dbPath = path.join(tmpDir, 'test.db');
  storage = new StorageService(dbPath);
  repoManager = new RepoManager(storage);
  gitRepoPath = fs.realpathSync(createTempGitRepo());
});

afterEach(() => {
  storage.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('RepoManager', () => {
  it('computes deterministic repo IDs', () => {
    const id1 = computeRepoId('/home/user/project');
    const id2 = computeRepoId('/home/user/project');
    const id3 = computeRepoId('/home/user/other');

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toHaveLength(64);
  });

  it('registers a git repository', async () => {
    const repo = await repoManager.registerRepo(gitRepoPath);

    expect(repo.name).toBe('git-repo');
    expect(repo.status).toBe('initialized');
    expect(repo.path).toBe(gitRepoPath);
  });

  it('rejects non-git directories', async () => {
    const nonGitDir = path.join(tmpDir, 'not-a-repo');
    fs.mkdirSync(nonGitDir);

    await expect(repoManager.registerRepo(nonGitDir)).rejects.toThrow(NotAGitRepoError);
  });

  it('rejects duplicate registration', async () => {
    await repoManager.registerRepo(gitRepoPath);
    await expect(repoManager.registerRepo(gitRepoPath)).rejects.toThrow(RepoAlreadyExistsError);
  });

  it('retrieves repo by path', async () => {
    await repoManager.registerRepo(gitRepoPath);

    const found = repoManager.getRepoByPath(gitRepoPath);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('git-repo');
  });

  it('lists all repos', async () => {
    await repoManager.registerRepo(gitRepoPath);

    const repos = repoManager.listRepos();
    expect(repos).toHaveLength(1);
  });

  it('resolveRepo auto-registers unknown paths', async () => {
    const repo = await repoManager.resolveRepo(gitRepoPath);
    expect(repo.status).toBe('initialized');

    const same = await repoManager.resolveRepo(gitRepoPath);
    expect(same.id).toBe(repo.id);
  });

  it('removes a repo', async () => {
    const repo = await repoManager.registerRepo(gitRepoPath);
    repoManager.removeRepo(repo.id);

    expect(repoManager.getRepoByPath(gitRepoPath)).toBeNull();
  });

  it('throws when removing non-existent repo', () => {
    expect(() => repoManager.removeRepo('nonexistent')).toThrow(RepoNotFoundError);
  });

  it('detects languages in a repo', async () => {
    const languages = await repoManager.detectLanguages(gitRepoPath);
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
  });

  it('updates repo status', async () => {
    const repo = await repoManager.registerRepo(gitRepoPath);
    repoManager.updateStatus(repo.id, 'ready');

    const updated = repoManager.getRepoById(repo.id);
    expect(updated.status).toBe('ready');
  });
});
