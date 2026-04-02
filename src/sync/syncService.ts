import type {
  ApplyKBUpdatesInput,
  KBManifest,
  SyncKBOutput,
} from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import { SyncCollector } from './syncCollector.js';
import { ManifestService } from '../manifest/manifestService.js';
import { RuleService } from '../knowledge/ruleService.js';

export class SyncService {
  private syncCollector: SyncCollector;
  private manifestService: ManifestService;
  private ruleService: RuleService;

  constructor(private storage: StorageService) {
    this.syncCollector = new SyncCollector(storage);
    this.manifestService = new ManifestService(storage);
    this.ruleService = new RuleService(storage);
  }

  async collectSyncData(
    repoId: string,
    repoPath: string,
    files?: string[],
    includeFullDiff?: boolean,
  ): Promise<SyncKBOutput> {
    return this.syncCollector.collect(repoId, repoPath, files, includeFullDiff);
  }

  async applyUpdates(
    repoId: string,
    repoPath: string,
    input: ApplyKBUpdatesInput,
  ): Promise<{ success: boolean; updatedManifest: KBManifest; changesSummary: string[] }> {
    const summary: string[] = [];

    this.storage.transaction(() => {
      for (const update of input.nodeUpdates) {
        const node = this.storage.getGraphNode(repoId, update.filePath);
        if (node) {
          const updatedNode = {
            ...node,
            summary: update.summary ?? node.summary,
            responsibilities: update.responsibilities ?? node.responsibilities,
            lastAnalyzed: new Date().toISOString(),
          };
          this.storage.upsertGraphNode(updatedNode);
          summary.push(`Updated node: ${update.filePath}`);
        }
      }

      for (const change of input.ruleChanges) {
        if (change.action === 'add' && change.rule.content && change.rule.type) {
          const newRule = this.ruleService.addRule({
            repoId,
            type: change.rule.type,
            content: change.rule.content,
            scope: change.rule.scope,
            tags: change.rule.tags,
            source: change.rule.source ?? 'ai-suggested',
          });
          summary.push(`Added rule: ${newRule.content.substring(0, 50)}`);
        } else if (change.action === 'update' && change.rule.id) {
          this.ruleService.updateRule({
            id: change.rule.id,
            content: change.rule.content,
            scope: change.rule.scope,
            tags: change.rule.tags,
            active: change.rule.active,
          });
          summary.push(`Updated rule: ${change.rule.id}`);
        } else if (change.action === 'deactivate' && change.rule.id) {
          this.ruleService.deactivateRule(change.rule.id);
          summary.push(`Deactivated rule: ${change.rule.id}`);
        }
      }
    });

    const updatedManifest = await this.manifestService.generateManifest(
      repoId,
      repoPath,
      'agent',
    );

    return {
      success: true,
      updatedManifest,
      changesSummary: summary,
    };
  }
}
