import type { GraphNode, GraphEdge } from '../core/types.js';
import type { StorageService } from '../core/storage.js';

export class GraphQuery {
  constructor(private storage: StorageService) {}

  getNode(repoId: string, filePath: string): GraphNode | null {
    return this.storage.getGraphNode(repoId, filePath);
  }

  getNodeById(id: string): GraphNode | null {
    return this.storage.getGraphNodeById(id);
  }

  listNodes(repoId: string): GraphNode[] {
    return this.storage.listGraphNodes(repoId);
  }

  listEdges(repoId: string): GraphEdge[] {
    return this.storage.listGraphEdges(repoId);
  }

  getDependenciesOf(repoId: string, filePath: string): GraphEdge[] {
    const nodeId = `${repoId}:${filePath}`;
    return this.storage.getEdgesFrom(nodeId);
  }

  getDependentsOf(repoId: string, filePath: string): GraphEdge[] {
    const nodeId = `${repoId}:${filePath}`;
    return this.storage.getEdgesTo(nodeId);
  }

  getAffectedByChange(repoId: string, filePaths: string[]): string[] {
    const visited = new Set<string>();
    const queue = filePaths.map((fp) => `${repoId}:${fp}`);

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const dependents = this.storage.getEdgesTo(nodeId);
      for (const edge of dependents) {
        if (!visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }

    return [...visited].map((id) => {
      const colonIndex = id.indexOf(':');
      return id.substring(colonIndex + 1);
    });
  }

  getSubgraph(
    repoId: string,
    filePath: string,
    depth: number = 2,
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodeId = `${repoId}:${filePath}`;
    const visitedNodes = new Set<string>();
    const collectedEdges: GraphEdge[] = [];
    const queue: { id: string; currentDepth: number }[] = [{ id: nodeId, currentDepth: 0 }];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      if (visitedNodes.has(id)) continue;
      visitedNodes.add(id);

      if (currentDepth >= depth) continue;

      const outgoing = this.storage.getEdgesFrom(id);
      const incoming = this.storage.getEdgesTo(id);

      for (const edge of [...outgoing, ...incoming]) {
        collectedEdges.push(edge);
        const neighbor = edge.source === id ? edge.target : edge.source;
        if (!visitedNodes.has(neighbor)) {
          queue.push({ id: neighbor, currentDepth: currentDepth + 1 });
        }
      }
    }

    const nodes: GraphNode[] = [];
    for (const nid of visitedNodes) {
      const node = this.storage.getGraphNodeById(nid);
      if (node) nodes.push(node);
    }

    const uniqueEdges = collectedEdges.filter(
      (edge, index, self) => self.findIndex((e) => e.id === edge.id) === index,
    );

    return { nodes, edges: uniqueEdges };
  }
}
