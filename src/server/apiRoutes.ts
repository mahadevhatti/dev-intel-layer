import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { simpleGit } from 'simple-git';
import type { GraphNode, GraphEdge } from '../core/types.js';
import type { ServerDependencies } from './httpServer.js';
import { CortexError } from '../core/errors.js';

export function createApiRoutes(deps: ServerDependencies): Router {
  const router = Router();
  const { storage, repoManager, repoRouter, ruleService, manifestService, graphQuery } = deps;

  function handleError(res: Response, err: unknown) {
    if (err instanceof CortexError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  }

  // ─── Repo Endpoints ──────────────────────────────────────────────

  router.get('/repos', (_req, res) => {
    try {
      const repos = repoManager.listRepos();
      res.json({ repos });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/repos', async (req: Request, res: Response) => {
    try {
      const { path: repoPath } = req.body;
      if (!repoPath) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'path is required' });
        return;
      }
      const repo = await repoManager.resolveRepo(repoPath);
      const languages = await repoManager.detectLanguages(repo.path);
      repoManager.updateLanguages(repo.id, languages);
      repo.languages = languages;
      res.status(201).json({ repo });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/repos/manifest', async (req: Request, res: Response) => {
    try {
      const repoPath = req.query.repoPath as string;
      if (!repoPath) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'repoPath required' });
        return;
      }
      const ctx = await repoRouter.resolve(repoPath);
      const manifest = manifestService.getManifest(ctx.repo.id);
      if (!manifest) {
        res.json({ stagedHash: 'UNKNOWN' });
        return;
      }
      res.json(manifest);
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/repos/notify', async (req: Request, res: Response) => {
    try {
      const { repoPath, event, branch } = req.body;
      if (!repoPath || !event) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'repoPath and event required' });
        return;
      }
      // Acknowledge the event — actual handling happens in later phases
      res.json({ received: true, event, repoPath, branch });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/repos/:repoId', (req, res) => {
    try {
      const ctx = repoRouter.resolveById(req.params.repoId);
      const manifest = manifestService.getManifest(ctx.repo.id);
      const stats = storage.getRepoStats(ctx.repo.id);
      res.json({ repo: ctx.repo, manifest, stats });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ─── Graph Endpoints ─────────────────────────────────────────────

  router.get('/repos/:repoId/graph', (req, res) => {
    try {
      const { repoId } = req.params;
      const file = req.query.file as string | undefined;
      const depth = parseInt(req.query.depth as string) || 2;

      if (file) {
        const subgraph = graphQuery.getSubgraph(repoId, file, depth);
        res.json(subgraph);
      } else {
        const nodes = graphQuery.listNodes(repoId);
        const edges = graphQuery.listEdges(repoId);
        res.json({ nodes, edges });
      }
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/repos/:repoId/graph/build', async (req: Request, res: Response) => {
    try {
      const ctx = repoRouter.resolveById(req.params.repoId);
      const repoId = ctx.repo.id;
      const rootPath = ctx.repo.path;
      const ignorePaths = (req.body.ignorePaths as string[]) ?? ['node_modules', '.git', 'dist', 'coverage'];

      repoManager.updateStatus(repoId, 'scanning');

      const git = simpleGit(rootPath);
      const commitHash = await git.revparse(['HEAD']);
      const filesStr = await git.raw(['ls-files']);
      const allFiles = filesStr.trim().split('\n').filter(Boolean);

      const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.py', '.rs', '.go', '.java']);
      const sourceFiles = allFiles.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return sourceExts.has(ext) && !ignorePaths.some(ig => f.includes(ig));
      });

      const langMap: Record<string, string> = {
        '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
        '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
      };

      let nodesCreated = 0;
      let edgesCreated = 0;

      for (const filePath of sourceFiles) {
        const ext = path.extname(filePath).toLowerCase();
        const language = langMap[ext] ?? 'unknown';
        const nodeIdVal = `${repoId}:${filePath}`;

        const fullPath = path.join(rootPath, filePath);
        let content = '';
        try { content = fs.readFileSync(fullPath, 'utf-8'); } catch { continue; }

        const symbols = parseSymbolsFromContent(content, language);

        const node: GraphNode = {
          id: nodeIdVal,
          repoId,
          filePath,
          language,
          symbols,
          summary: '',
          responsibilities: [],
          lastAnalyzed: new Date().toISOString(),
          commitHash: commitHash.trim(),
        };
        storage.upsertGraphNode(node);
        nodesCreated++;
      }

      for (const filePath of sourceFiles) {
        const fullPath = path.join(rootPath, filePath);
        let content = '';
        try { content = fs.readFileSync(fullPath, 'utf-8'); } catch { continue; }

        const imports = parseImports(content);
        const sourceNodeId = `${repoId}:${filePath}`;

        for (const imp of imports) {
          const resolvedTarget = resolveImportPath(filePath, imp, sourceFiles);
          if (!resolvedTarget) continue;

          const targetNodeId = `${repoId}:${resolvedTarget}`;
          const edge: GraphEdge = {
            id: uuidv4(),
            repoId,
            source: sourceNodeId,
            target: targetNodeId,
            relationship: 'imports',
            symbols: [imp],
          };
          storage.upsertGraphEdge(edge);
          edgesCreated++;
        }
      }

      repoManager.updateStatus(repoId, 'ready');

      const manifest = await manifestService.generateManifest(repoId, rootPath, 'graph-build');
      res.json({ nodesCreated, edgesCreated, filesScanned: sourceFiles.length, manifest });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ─── Rule Endpoints ──────────────────────────────────────────────

  router.get('/repos/:repoId/rules', (req, res) => {
    try {
      const { repoId } = req.params;
      const type = req.query.type as string | undefined;
      const scope = req.query.scope as string | undefined;
      const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;
      const includeCrossRepo = req.query.includeCrossRepo !== 'false';

      const rules = ruleService.listRules({
        repoId,
        type: type as 'constraint' | 'lesson' | 'preference' | undefined,
        scope,
        active,
        includeCrossRepo,
      });
      res.json({ rules });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/repos/:repoId/rules', (req, res) => {
    try {
      const { repoId } = req.params;
      const { type, content, scope, tags, source } = req.body;
      const rule = ruleService.addRule({ repoId, type, content, scope, tags, source });
      res.status(201).json({ rule });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.put('/repos/:repoId/rules/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { content, scope, tags, active } = req.body;
      const rule = ruleService.updateRule({ id, content, scope, tags, active });
      res.json({ rule });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ─── Manifest Endpoints ──────────────────────────────────────────

  router.get('/repos/:repoId/manifest', (req, res) => {
    try {
      const manifest = manifestService.getManifest(req.params.repoId);
      if (!manifest) {
        res.status(404).json({ error: 'MANIFEST_NOT_FOUND' });
        return;
      }
      res.json({ manifest });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ─── Context Endpoint ────────────────────────────────────────────

  router.get('/repos/:repoId/context', (req, res) => {
    try {
      const repoId = req.params.repoId;
      const file = req.query.file as string;
      if (!file) {
        res.status(400).json({ error: 'MISSING_PARAM', message: 'file query param required' });
        return;
      }
      const depth = parseInt(req.query.depth as string) || 2;

      const subgraph = graphQuery.getSubgraph(repoId, file, depth);
      const rules = ruleService.getRulesForContext(repoId);
      const relatedFiles = subgraph.nodes.map((n) => n.filePath).filter((f) => f !== file);

      res.json({
        nodes: subgraph.nodes,
        edges: subgraph.edges,
        rules,
        relatedFiles,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ─── Stats Endpoint ──────────────────────────────────────────────

  router.get('/repos/:repoId/stats', (req, res) => {
    try {
      const stats = storage.getRepoStats(req.params.repoId);
      res.json(stats);
    } catch (err) {
      handleError(res, err);
    }
  });

  // ─── Cross-Repo Rules ────────────────────────────────────────────

  router.get('/rules/cross-repo', (_req, res) => {
    try {
      const rules = ruleService.listCrossRepoRules();
      res.json({ rules });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/rules/cross-repo', (req, res) => {
    try {
      const { type, content, tags, source } = req.body;
      const rule = ruleService.addRule({
        repoId: null,
        type,
        content,
        scope: 'cross-repo',
        tags,
        source,
      });
      res.status(201).json({ rule });
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function parseSymbolsFromContent(content: string, language: string): GraphNode['symbols'] {
  const symbols: GraphNode['symbols'] = [];
  if (!['typescript', 'javascript'].includes(language)) return symbols;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const exported = line.includes('export ');

    const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) {
      symbols.push({ name: fnMatch[1], kind: 'function', range: { startLine: i, endLine: i }, exported });
      continue;
    }

    const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', range: { startLine: i, endLine: i }, exported });
      continue;
    }

    const ifaceMatch = line.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: 'interface', range: { startLine: i, endLine: i }, exported });
      continue;
    }

    const constMatch = line.match(/(?:export\s+)?const\s+(\w+)/);
    if (constMatch && !line.includes('require(')) {
      symbols.push({ name: constMatch[1], kind: 'variable', range: { startLine: i, endLine: i }, exported });
    }
  }
  return symbols;
}

function parseImports(content: string): string[] {
  const imports: string[] = [];
  const esImportRegex = /from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = esImportRegex.exec(content)) !== null) {
    const specifier = match[1];
    if (specifier.startsWith('.')) imports.push(specifier);
  }
  return imports;
}

function resolveImportPath(sourceFile: string, importSpecifier: string, allFiles: string[]): string | null {
  const sourceDir = path.dirname(sourceFile);
  const resolved = path.normalize(path.join(sourceDir, importSpecifier));

  const candidates = [
    resolved,
    resolved + '.ts',
    resolved + '.tsx',
    resolved + '.js',
    resolved + '.jsx',
    path.join(resolved, 'index.ts'),
    path.join(resolved, 'index.js'),
  ];

  for (const candidate of candidates) {
    if (allFiles.includes(candidate)) return candidate;
  }

  const withoutExt = resolved.replace(/\.js$/, '');
  const tsCandidate = withoutExt + '.ts';
  if (allFiles.includes(tsCandidate)) return tsCandidate;

  return null;
}
