import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StorageService } from '../../src/core/storage.js';
import { RuleService } from '../../src/knowledge/ruleService.js';
import { RuleNotFoundError } from '../../src/core/errors.js';

let storage: StorageService;
let ruleService: RuleService;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dil-rule-test-'));
  storage = new StorageService(path.join(tmpDir, 'test.db'));
  ruleService = new RuleService(storage);

  const now = new Date().toISOString();
  storage.createRepo({
    id: 'repo-1', name: 'test', path: '/tmp/test',
    status: 'ready', languages: [], createdAt: now, lastAccessedAt: now,
  });
  storage.createRepo({
    id: 'repo-2', name: 'test2', path: '/tmp/test2',
    status: 'ready', languages: [], createdAt: now, lastAccessedAt: now,
  });
});

afterEach(() => {
  storage.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('RuleService', () => {
  it('adds a rule with defaults', () => {
    const rule = ruleService.addRule({
      repoId: 'repo-1',
      type: 'constraint',
      content: 'Use apiClient for HTTP',
    });

    expect(rule.id).toBeDefined();
    expect(rule.version).toBe(1);
    expect(rule.scope).toBe('global');
    expect(rule.source).toBe('manual');
    expect(rule.active).toBe(true);
  });

  it('adds a cross-repo rule when no repoId', () => {
    const rule = ruleService.addRule({
      type: 'preference',
      content: 'Use conventional commits',
    });

    expect(rule.repoId).toBeNull();
    expect(rule.scope).toBe('cross-repo');
  });

  it('retrieves a rule by id', () => {
    const created = ruleService.addRule({
      repoId: 'repo-1',
      type: 'lesson',
      content: 'Avoid lodash v4',
    });

    const found = ruleService.getRule(created.id);
    expect(found.content).toBe('Avoid lodash v4');
  });

  it('throws on non-existent rule', () => {
    expect(() => ruleService.getRule('nonexistent')).toThrow(RuleNotFoundError);
  });

  it('updates a rule and increments version', () => {
    const rule = ruleService.addRule({
      repoId: 'repo-1',
      type: 'constraint',
      content: 'Original',
    });

    const updated = ruleService.updateRule({
      id: rule.id,
      content: 'Updated content',
    });

    expect(updated.version).toBe(2);
    expect(updated.content).toBe('Updated content');
  });

  it('deactivates a rule', () => {
    const rule = ruleService.addRule({
      repoId: 'repo-1',
      type: 'constraint',
      content: 'To be deactivated',
    });

    const deactivated = ruleService.deactivateRule(rule.id);
    expect(deactivated.active).toBe(false);
  });

  it('lists rules for a repo including cross-repo', () => {
    ruleService.addRule({ repoId: 'repo-1', type: 'constraint', content: 'Repo 1 rule' });
    ruleService.addRule({ type: 'preference', content: 'Cross-repo rule' });

    const rules = ruleService.listRules({ repoId: 'repo-1' });
    expect(rules).toHaveLength(2);
  });

  it('lists cross-repo rules only', () => {
    ruleService.addRule({ repoId: 'repo-1', type: 'constraint', content: 'Repo rule' });
    ruleService.addRule({ type: 'preference', content: 'Cross-repo' });

    const crossRepo = ruleService.listCrossRepoRules();
    expect(crossRepo).toHaveLength(1);
    expect(crossRepo[0].content).toBe('Cross-repo');
  });

  it('getRulesForContext filters by branch', () => {
    ruleService.addRule({ repoId: 'repo-1', type: 'constraint', content: 'Global rule', scope: 'global' });
    ruleService.addRule({ repoId: 'repo-1', type: 'lesson', content: 'Feature rule', scope: 'branch:feature/auth' });
    ruleService.addRule({ repoId: 'repo-1', type: 'lesson', content: 'Other branch', scope: 'branch:feature/other' });

    const featureRules = ruleService.getRulesForContext('repo-1', 'feature/auth');
    expect(featureRules).toHaveLength(2);

    const mainRules = ruleService.getRulesForContext('repo-1', 'main');
    expect(mainRules).toHaveLength(1);
  });

  it('multi-repo isolation: rules are scoped', () => {
    ruleService.addRule({ repoId: 'repo-1', type: 'constraint', content: 'Repo 1 only' });
    ruleService.addRule({ repoId: 'repo-2', type: 'constraint', content: 'Repo 2 only' });

    const repo1Rules = ruleService.listRules({ repoId: 'repo-1', includeCrossRepo: false });
    const repo2Rules = ruleService.listRules({ repoId: 'repo-2', includeCrossRepo: false });

    expect(repo1Rules).toHaveLength(1);
    expect(repo1Rules[0].content).toBe('Repo 1 only');
    expect(repo2Rules).toHaveLength(1);
    expect(repo2Rules[0].content).toBe('Repo 2 only');
  });
});
