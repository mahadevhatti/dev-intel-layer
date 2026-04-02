import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import type { GraphNode, GraphEdge, SymbolInfo, SymbolKind } from '../core/types.js';
import type { StorageService } from '../core/storage.js';
import type { LSPServerPool } from '../lsp/serverPool.js';
import type { LanguageServerRegistry } from '../lsp/registry.js';
import { getDocumentSymbols, getDefinition, filePathToUri, uriToFilePath } from '../lsp/protocol.js';
import { SymbolKind as LSPSymbolKind, type DocumentSymbol } from 'vscode-languageserver-protocol';

export interface BuildResult {
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
}

const LSP_KIND_MAP: Partial<Record<number, SymbolKind>> = {
  [LSPSymbolKind.Function]: 'function',
  [LSPSymbolKind.Method]: 'method',
  [LSPSymbolKind.Class]: 'class',
  [LSPSymbolKind.Interface]: 'interface',
  [LSPSymbolKind.Variable]: 'variable',
  [LSPSymbolKind.Constant]: 'variable',
  [LSPSymbolKind.Enum]: 'enum',
  [LSPSymbolKind.TypeParameter]: 'type',
  [LSPSymbolKind.Module]: 'module',
  [LSPSymbolKind.Namespace]: 'module',
  [LSPSymbolKind.Property]: 'property',
};

function nodeId(repoId: string, filePath: string): string {
  return `${repoId}:${filePath}`;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.pyi': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
  };
  return langMap[ext] ?? 'unknown';
}

function flattenSymbols(symbols: DocumentSymbol[], isTopLevel = true): SymbolInfo[] {
  const result: SymbolInfo[] = [];
  for (const sym of symbols) {
    const kind = LSP_KIND_MAP[sym.kind];
    if (kind) {
      result.push({
        name: sym.name,
        kind,
        range: {
          startLine: sym.range.start.line,
          endLine: sym.range.end.line,
        },
        exported: isTopLevel,
      });
    }
    if (sym.children) {
      result.push(...flattenSymbols(sym.children, false));
    }
  }
  return result;
}

export class GraphBuilder {
  constructor(
    private lspPool: LSPServerPool,
    private registry: LanguageServerRegistry,
    private storage: StorageService,
  ) {}

  async buildFullGraph(
    repoId: string,
    rootPath: string,
    files: string[],
    commitHash: string,
    ignorePaths: string[] = [],
  ): Promise<BuildResult> {
    const result: BuildResult = { nodesCreated: 0, edgesCreated: 0, errors: [] };
    const filteredFiles = files.filter((f) =>
      !ignorePaths.some((ig) => f.includes(ig)),
    );

    for (const filePath of filteredFiles) {
      try {
        const node = await this.buildNodeForFile(repoId, rootPath, filePath, commitHash);
        if (node) {
          this.storage.upsertGraphNode(node);
          result.nodesCreated++;
        }
      } catch (err) {
        result.errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const filePath of filteredFiles) {
      try {
        const edges = await this.buildEdgesForFile(repoId, rootPath, filePath);
        for (const edge of edges) {
          this.storage.upsertGraphEdge(edge);
          result.edgesCreated++;
        }
      } catch (err) {
        result.errors.push(`edges:${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }

  async rebuildIncremental(
    repoId: string,
    rootPath: string,
    changedFiles: string[],
    commitHash: string,
  ): Promise<BuildResult> {
    const result: BuildResult = { nodesCreated: 0, edgesCreated: 0, errors: [] };

    for (const filePath of changedFiles) {
      const fullPath = path.join(rootPath, filePath);

      if (!fs.existsSync(fullPath)) {
        const nid = nodeId(repoId, filePath);
        this.storage.deleteGraphNode(nid);
        continue;
      }

      try {
        const node = await this.buildNodeForFile(repoId, rootPath, filePath, commitHash);
        if (node) {
          this.storage.deleteEdgesForNode(node.id);
          this.storage.upsertGraphNode(node);
          result.nodesCreated++;

          const edges = await this.buildEdgesForFile(repoId, rootPath, filePath);
          for (const edge of edges) {
            this.storage.upsertGraphEdge(edge);
            result.edgesCreated++;
          }
        }
      } catch (err) {
        result.errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }

  private async buildNodeForFile(
    repoId: string,
    rootPath: string,
    filePath: string,
    commitHash: string,
  ): Promise<GraphNode | null> {
    const language = detectLanguage(filePath);
    const serverConfig = this.registry.getServerForLanguage(language);

    let symbols: SymbolInfo[] = [];
    if (serverConfig) {
      const connection = this.lspPool.getConnection(repoId, serverConfig.id);
      if (connection) {
        try {
          const fileUri = filePathToUri(path.join(rootPath, filePath));
          const docSymbols = await getDocumentSymbols(connection, fileUri);
          symbols = flattenSymbols(docSymbols);
        } catch {
          // LSP may not support all files
        }
      }
    }

    const existing = this.storage.getGraphNode(repoId, filePath);

    return {
      id: nodeId(repoId, filePath),
      repoId,
      filePath,
      language,
      symbols,
      summary: existing?.summary ?? '',
      responsibilities: existing?.responsibilities ?? [],
      lastAnalyzed: new Date().toISOString(),
      commitHash,
    };
  }

  private async buildEdgesForFile(
    repoId: string,
    rootPath: string,
    filePath: string,
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];
    const language = detectLanguage(filePath);
    const serverConfig = this.registry.getServerForLanguage(language);
    if (!serverConfig) return edges;

    const connection = this.lspPool.getConnection(repoId, serverConfig.id);
    if (!connection) return edges;

    const sourceNodeId = nodeId(repoId, filePath);
    const node = this.storage.getGraphNodeById(sourceNodeId);
    if (!node) return edges;

    const seenTargets = new Set<string>();

    for (const symbol of node.symbols) {
      if (!symbol.exported) continue;

      try {
        const fileUri = filePathToUri(path.join(rootPath, filePath));
        const definitions = await getDefinition(
          connection,
          fileUri,
          symbol.range.startLine,
          0,
        );

        for (const def of definitions) {
          const defUri = 'uri' in def ? def.uri : ('targetUri' in def ? def.targetUri : '');
          const defPath = uriToFilePath(defUri);
          const relativePath = path.relative(rootPath, defPath);

          if (relativePath === filePath || relativePath.startsWith('..')) continue;
          if (relativePath.includes('node_modules')) continue;

          const targetNodeId = nodeId(repoId, relativePath);
          const edgeKey = `${sourceNodeId}->${targetNodeId}`;

          if (!seenTargets.has(edgeKey)) {
            seenTargets.add(edgeKey);
            edges.push({
              id: uuidv4(),
              repoId,
              source: sourceNodeId,
              target: targetNodeId,
              relationship: 'imports',
              symbols: [symbol.name],
            });
          }
        }
      } catch {
        // Skip symbols where definition lookup fails
      }
    }

    return edges;
  }
}
