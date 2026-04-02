import type { KBConflict, ConflictResolution, KnowledgeRule } from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import { v4 as uuidv4 } from 'uuid';

export class ConflictResolver {
  constructor(private storage: StorageService) {}

  detectConflicts(repoId: string, incomingRules: Partial<KnowledgeRule>[]): KBConflict[] {
    const conflicts: KBConflict[] = [];

    for (const incoming of incomingRules) {
      if (!incoming.id) continue;
      const local = this.storage.getRule(incoming.id);
      if (!local) continue;

      if (incoming.version !== undefined && incoming.version !== local.version) {
        conflicts.push({
          type: 'rule',
          id: uuidv4(),
          repoId,
          local,
          incoming: { ...local, ...incoming } as KnowledgeRule,
          suggestedResolution: incoming.version > local.version ? 'accept-incoming' : 'keep-local',
        });
      }
    }

    return conflicts;
  }

  resolveConflict(
    conflict: KBConflict,
    resolution: ConflictResolution,
    customValue?: Partial<KnowledgeRule>,
  ): boolean {
    if (conflict.type !== 'rule') return false;

    switch (resolution) {
      case 'keep-local':
        return true;

      case 'accept-incoming': {
        const incoming = conflict.incoming as KnowledgeRule;
        this.storage.updateRule(incoming.id, {
          content: incoming.content,
          scope: incoming.scope,
          tags: incoming.tags,
          active: incoming.active,
        });
        return true;
      }

      case 'manual': {
        if (!customValue?.id) return false;
        this.storage.updateRule(customValue.id, {
          content: customValue.content,
          scope: customValue.scope,
          tags: customValue.tags,
          active: customValue.active,
        });
        return true;
      }

      default:
        return false;
    }
  }
}
