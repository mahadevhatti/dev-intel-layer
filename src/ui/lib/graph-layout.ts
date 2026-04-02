import * as d3 from 'd3';
import type { GraphNode, GraphEdge } from '../lib/api-client';

export interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  filePath: string;
  language: string;
  symbolCount: number;
  hasSummary: boolean;
}

export interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  relationship: string;
  symbols: string[];
}

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3776ab',
  rust: '#dea584',
  go: '#00add8',
  java: '#b07219',
  default: '#6366f1',
};

export function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? LANGUAGE_COLORS.default;
}

export function buildSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
) {
  const simNodes: SimNode[] = nodes.map((n) => ({
    id: n.id,
    filePath: n.filePath,
    language: n.language,
    symbolCount: n.symbols.length,
    hasSummary: !!n.summary,
  }));

  const nodeIds = new Set(simNodes.map((n) => n.id));

  const simLinks: SimLink[] = edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationship: e.relationship,
      symbols: e.symbols,
    }));

  const simulation = d3
    .forceSimulation<SimNode>(simNodes)
    .force(
      'link',
      d3
        .forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(100),
    )
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(30));

  return { simulation, simNodes, simLinks };
}
