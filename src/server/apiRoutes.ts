import { Router, type Request, type Response } from 'express';
import type { ServerDependencies } from './httpServer.js';
import { DILError } from '../core/errors.js';

export function createApiRoutes(deps: ServerDependencies): Router {
  const router = Router();
  const { storage, repoManager, repoRouter, ruleService, manifestService, graphQuery } = deps;

  function handleError(res: Response, err: unknown) {
    if (err instanceof DILError) {
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
