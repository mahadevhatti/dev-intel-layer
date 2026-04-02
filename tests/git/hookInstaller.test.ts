import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { installHooks, uninstallHooks } from '../../src/git/hookInstaller.js';

let tmpDir: string;
let repoPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-hook-test-'));
  repoPath = path.join(tmpDir, 'repo');
  fs.mkdirSync(repoPath);
  execSync('git init', { cwd: repoPath, stdio: 'ignore' });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('installHooks', () => {
  it('installs all three hooks', () => {
    const result = installHooks(repoPath);
    expect(result.installed).toContain('pre-commit');
    expect(result.installed).toContain('post-merge');
    expect(result.installed).toContain('post-checkout');
    expect(result.skipped).toHaveLength(0);
  });

  it('creates executable hook files', () => {
    installHooks(repoPath);
    const hookPath = path.join(repoPath, '.git', 'hooks', 'pre-commit');
    expect(fs.existsSync(hookPath)).toBe(true);

    const stat = fs.statSync(hookPath);
    expect(stat.mode & 0o111).toBeTruthy();
  });

  it('hook content contains Cortex server URL', () => {
    installHooks(repoPath);
    const content = fs.readFileSync(
      path.join(repoPath, '.git', 'hooks', 'pre-commit'),
      'utf-8',
    );
    expect(content).toContain('localhost:4170');
  });

  it('overwrites existing Cortex hooks', () => {
    installHooks(repoPath);
    const result = installHooks(repoPath);
    expect(result.installed).toContain('pre-commit');
  });

  it('skips existing non-Cortex hooks', () => {
    const hookPath = path.join(repoPath, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom hook"', { mode: 0o755 });

    const result = installHooks(repoPath);
    expect(result.skipped).toContain('pre-commit');
    expect(result.installed).toContain('post-merge');
  });

  it('installs specific hook types only', () => {
    const result = installHooks(repoPath, ['pre-commit']);
    expect(result.installed).toEqual(['pre-commit']);
  });
});

describe('uninstallHooks', () => {
  it('removes Cortex hooks', () => {
    installHooks(repoPath);
    const result = uninstallHooks(repoPath);
    expect(result.removed).toContain('pre-commit');
    expect(result.removed).toContain('post-merge');
    expect(result.removed).toContain('post-checkout');
  });

  it('does not remove non-Cortex hooks', () => {
    const hookPath = path.join(repoPath, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom"', { mode: 0o755 });

    const result = uninstallHooks(repoPath, ['pre-commit']);
    expect(result.skipped).toContain('pre-commit');
    expect(result.removed).toHaveLength(0);
  });

  it('skips non-existent hooks', () => {
    const result = uninstallHooks(repoPath);
    expect(result.skipped).toHaveLength(3);
  });
});
