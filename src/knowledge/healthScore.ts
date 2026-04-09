import type { StorageService } from '../core/storage.js';

export interface HealthFactor {
  factor: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HealthResult {
  score: number;
  breakdown: HealthFactor[];
  suggestions: string[];
}

export class HealthComputer {
  constructor(private storage: StorageService) {}

  compute(repoId: string): HealthResult {
    const nodes = this.storage.listGraphNodes(repoId);
    const edges = this.storage.listGraphEdges(repoId);
    const stats = this.storage.getRepoStats(repoId);
    const manifest = this.storage.getManifest(repoId);

    const breakdown: HealthFactor[] = [];
    const suggestions: string[] = [];

    // 1. Summary coverage (30%)
    const withSummary = nodes.filter(n => n.summary && n.summary.trim().length > 0).length;
    const summaryCoverage = nodes.length > 0 ? (withSummary / nodes.length) * 100 : 0;
    breakdown.push({
      factor: 'Summary Coverage',
      score: Math.round(summaryCoverage),
      weight: 30,
      detail: `${withSummary}/${nodes.length} nodes have summaries`,
    });
    if (summaryCoverage < 50) suggestions.push(`Run sync_kb to fill ${nodes.length - withSummary} empty node summaries`);

    // 2. Responsibilities coverage (15%)
    const withResponsibilities = nodes.filter(n => n.responsibilities && n.responsibilities.length > 0).length;
    const respCoverage = nodes.length > 0 ? (withResponsibilities / nodes.length) * 100 : 0;
    breakdown.push({
      factor: 'Responsibilities Coverage',
      score: Math.round(respCoverage),
      weight: 15,
      detail: `${withResponsibilities}/${nodes.length} nodes have responsibilities`,
    });
    if (respCoverage < 50) suggestions.push(`${nodes.length - withResponsibilities} nodes need responsibility annotations`);

    // 3. Graph freshness (20%) - based on how recently nodes were analyzed
    let freshnessScore = 0;
    if (nodes.length > 0) {
      const now = Date.now();
      const dayOld = 24 * 60 * 60 * 1000;
      const freshNodes = nodes.filter(n => {
        const age = now - new Date(n.lastAnalyzed).getTime();
        return age < 7 * dayOld;
      }).length;
      freshnessScore = (freshNodes / nodes.length) * 100;
    } else {
      freshnessScore = 0;
    }
    breakdown.push({
      factor: 'Graph Freshness',
      score: Math.round(freshnessScore),
      weight: 20,
      detail: nodes.length > 0 ? `${Math.round(freshnessScore)}% of nodes analyzed in last 7 days` : 'No nodes in graph',
    });
    if (freshnessScore < 50 && nodes.length > 0) suggestions.push('Rebuild the dependency graph to refresh stale nodes');

    // 4. Manifest freshness (15%)
    let manifestScore = 0;
    if (manifest) {
      const age = Date.now() - new Date(manifest.lastSyncedAt).getTime();
      const dayOld = 24 * 60 * 60 * 1000;
      if (age < 1 * dayOld) manifestScore = 100;
      else if (age < 3 * dayOld) manifestScore = 75;
      else if (age < 7 * dayOld) manifestScore = 50;
      else manifestScore = 25;
    }
    breakdown.push({
      factor: 'Manifest Freshness',
      score: manifestScore,
      weight: 15,
      detail: manifest ? `Last synced ${manifest.lastSyncedAt}` : 'No manifest generated',
    });
    if (manifestScore < 50) suggestions.push('Generate a fresh manifest with sync_kb');

    // 5. Rule coverage (10%)
    const ruleRatio = nodes.length > 0 ? Math.min(100, (stats.ruleCount / nodes.length) * 200) : 0;
    breakdown.push({
      factor: 'Rule Coverage',
      score: Math.round(ruleRatio),
      weight: 10,
      detail: `${stats.ruleCount} rules for ${nodes.length} nodes`,
    });
    if (stats.ruleCount === 0) suggestions.push('Add knowledge rules to capture project constraints and preferences');

    // 6. Orphan detection (10%)
    const connectedNodes = new Set<string>();
    for (const edge of edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }
    const orphanCount = nodes.filter(n => !connectedNodes.has(n.id)).length;
    const orphanScore = nodes.length > 0 ? ((nodes.length - orphanCount) / nodes.length) * 100 : 100;
    breakdown.push({
      factor: 'Graph Connectivity',
      score: Math.round(orphanScore),
      weight: 10,
      detail: orphanCount > 0 ? `${orphanCount} orphan nodes with no edges` : 'All nodes connected',
    });
    if (orphanCount > 5) suggestions.push(`${orphanCount} files have no import/export relationships - verify graph completeness`);

    // Weighted average
    const score = Math.round(
      breakdown.reduce((sum, f) => sum + (f.score * f.weight / 100), 0)
    );

    return { score, breakdown, suggestions };
  }
}
