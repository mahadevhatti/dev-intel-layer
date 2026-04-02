import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { GitService } from '../../src/git/gitService.js';

let tmpDir: string;
let repoPath: string;
let gitService: GitService;

function exec(cmd: string) {
  execSync(cmd, { cwd: repoPath, stdio: 'ignore' });
}

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-git-test-')));
  repoPath = path.join(tmpDir, 'repo');
  fs.mkdirSync(repoPath);
  exec('git init');
  exec('git config user.email "test@test.com"');
  exec('git config user.name "Test"');
  fs.writeFileSync(path.join(repoPath, 'index.ts'), 'export const a = 1;');
  exec('git add . && git commit -m "initial"');
  gitService = new GitService(repoPath);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GitService', () => {
  it('detects inside work tree', async () => {
    expect(await gitService.isInsideWorkTree()).toBe(true);
  });

  it('gets current commit hash', async () => {
    const commit = await gitService.getCurrentCommit();
    expect(commit).toMatch(/^[a-f0-9]{40}$/);
  });

  it('gets branch name', async () => {
    const branch = await gitService.getBranchName();
    expect(['main', 'master']).toContain(branch);
  });

  it('gets repo root', async () => {
    const root = await gitService.getRepoRoot();
    expect(root).toBe(repoPath);
  });

  it('lists tracked files', async () => {
    const files = await gitService.getTrackedFiles();
    expect(files).toContain('index.ts');
  });

  it('detects staged files', async () => {
    fs.writeFileSync(path.join(repoPath, 'new.ts'), 'export const b = 2;');
    exec('git add new.ts');

    const staged = await gitService.getStagedFiles();
    expect(staged).toContain('new.ts');
  });

  it('gets staged diff', async () => {
    fs.writeFileSync(path.join(repoPath, 'index.ts'), 'export const a = 2;');
    exec('git add index.ts');

    const diff = await gitService.getStagedDiff();
    expect(diff).toContain('export const a = 2');
  });

  it('returns empty array when no files staged', async () => {
    const staged = await gitService.getStagedFiles();
    expect(staged).toEqual([]);
  });

  it('detects files changed since a commit', async () => {
    const firstCommit = await gitService.getCurrentCommit();

    fs.writeFileSync(path.join(repoPath, 'second.ts'), 'export const c = 3;');
    exec('git add . && git commit -m "second"');

    const changed = await gitService.getChangedFilesSince(firstCommit);
    expect(changed).toContain('second.ts');
  });
});
