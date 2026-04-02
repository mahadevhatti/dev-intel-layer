import { v4 as uuidv4 } from 'uuid';
import type {
  KnowledgeRule,
  KnowledgeType,
  KnowledgeScope,
  KnowledgeSource,
} from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import { RuleNotFoundError } from '../core/errors.js';

export interface AddRuleInput {
  repoId?: string | null;
  type: KnowledgeType;
  content: string;
  scope?: KnowledgeScope;
  tags?: string[];
  source?: KnowledgeSource;
}

export interface UpdateRuleInput {
  id: string;
  content?: string;
  scope?: KnowledgeScope;
  tags?: string[];
  active?: boolean;
}

export interface ListRulesFilter {
  repoId?: string | null;
  scope?: string;
  type?: KnowledgeType;
  active?: boolean;
  includeCrossRepo?: boolean;
}

export class RuleService {
  constructor(private storage: StorageService) {}

  addRule(input: AddRuleInput): KnowledgeRule {
    const now = new Date().toISOString();
    const scope = input.scope ?? (input.repoId ? 'global' : 'cross-repo');

    const rule: KnowledgeRule = {
      id: uuidv4(),
      repoId: scope === 'cross-repo' ? null : (input.repoId ?? null),
      type: input.type,
      content: input.content,
      scope,
      version: 1,
      tags: input.tags ?? [],
      source: input.source ?? 'manual',
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    return this.storage.createRule(rule);
  }

  getRule(id: string): KnowledgeRule {
    const rule = this.storage.getRule(id);
    if (!rule) throw new RuleNotFoundError(id);
    return rule;
  }

  updateRule(input: UpdateRuleInput): KnowledgeRule {
    const existing = this.storage.getRule(input.id);
    if (!existing) throw new RuleNotFoundError(input.id);

    const updated = this.storage.updateRule(input.id, {
      content: input.content,
      scope: input.scope,
      tags: input.tags,
      active: input.active,
    });

    if (!updated) throw new RuleNotFoundError(input.id);
    return updated;
  }

  deactivateRule(id: string): KnowledgeRule {
    return this.updateRule({ id, active: false });
  }

  listRules(filter: ListRulesFilter = {}): KnowledgeRule[] {
    return this.storage.listRules({
      repoId: filter.repoId,
      scope: filter.scope,
      type: filter.type,
      active: filter.active,
      includeCrossRepo: filter.includeCrossRepo ?? true,
    });
  }

  listCrossRepoRules(): KnowledgeRule[] {
    return this.storage.listCrossRepoRules();
  }

  getRulesForContext(repoId: string, branchName?: string): KnowledgeRule[] {
    const allRules = this.storage.listRules({
      repoId,
      active: true,
      includeCrossRepo: true,
    });

    if (!branchName) return allRules;

    return allRules.filter((rule) => {
      if (rule.scope === 'cross-repo' || rule.scope === 'global') return true;
      if (rule.scope === `branch:${branchName}`) return true;
      return false;
    });
  }
}
