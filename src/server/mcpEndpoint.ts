import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { ApplyKBUpdatesInput } from '../core/types.js';
import type { ServerDependencies } from './httpServer.js';

export function createMCPEndpoint(deps: ServerDependencies): Router {
  const router = Router();
  const { repoManager, repoRouter, ruleService, manifestService, syncService, graphQuery, storage } = deps;

  const mcpServer = new McpServer({
    name: 'dev-intel',
    version: '0.1.0',
  });

  // ─── MCP Tools ────────────────────────────────────────────────────

  mcpServer.tool('list_repos', 'List all registered repositories', {}, async () => {
    const repos = repoManager.listRepos();
    return { content: [{ type: 'text', text: JSON.stringify({ repos }, null, 2) }] };
  });

  mcpServer.tool(
    'get_repo_status',
    'Get detailed status of a specific repository',
    { repoPath: z.string().describe('Absolute path to the repository') },
    async ({ repoPath }) => {
      const ctx = await repoRouter.resolve(repoPath);
      const manifest = manifestService.getManifest(ctx.repo.id);
      const stats = storage.getRepoStats(ctx.repo.id);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ repo: ctx.repo, manifest, stats }, null, 2),
        }],
      };
    },
  );

  mcpServer.tool(
    'sync_kb',
    'Collect sync data for the AI agent to propose KB updates',
    {
      repoPath: z.string().describe('Absolute path to the repository'),
      files: z.array(z.string()).optional().describe('Scope to specific files'),
      includeFullDiff: z.boolean().optional().describe('Include full diff content'),
    },
    async ({ repoPath, files, includeFullDiff }) => {
      const ctx = await repoRouter.resolve(repoPath);
      const data = await syncService.collectSyncData(
        ctx.repo.id,
        ctx.repo.path,
        files,
        includeFullDiff,
      );
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );

  mcpServer.tool(
    'apply_kb_updates',
    'Apply human-approved KB updates and refresh manifest',
    {
      repoPath: z.string().describe('Absolute path to the repository'),
      nodeUpdates: z.array(z.object({
        filePath: z.string(),
        summary: z.string().optional(),
        responsibilities: z.array(z.string()).optional(),
      })).describe('Graph node updates'),
      ruleChanges: z.array(z.object({
        action: z.enum(['add', 'update', 'deactivate']),
        rule: z.object({
          id: z.string().optional(),
          type: z.enum(['constraint', 'lesson', 'preference']).optional(),
          content: z.string().optional(),
          scope: z.string().optional(),
          tags: z.array(z.string()).optional(),
          source: z.enum(['manual', 'ai-suggested']).optional(),
          active: z.boolean().optional(),
        }),
      })).describe('Rule changes to apply'),
    },
    async ({ repoPath, nodeUpdates, ruleChanges }) => {
      const ctx = await repoRouter.resolve(repoPath);
      const result = await syncService.applyUpdates(ctx.repo.id, ctx.repo.path, {
        repoPath,
        nodeUpdates,
        ruleChanges: ruleChanges as ApplyKBUpdatesInput['ruleChanges'],
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  mcpServer.tool(
    'get_context',
    'Get structured KB context for coding assistance',
    {
      repoPath: z.string().describe('Absolute path to the repository'),
      files: z.array(z.string()).optional().describe('Files to get context for'),
      depth: z.number().optional().describe('Graph traversal depth'),
    },
    async ({ repoPath, files, depth }) => {
      const ctx = await repoRouter.resolve(repoPath);
      const result: { nodes: unknown[]; edges: unknown[]; rules: unknown[]; relatedFiles: string[] } = {
        nodes: [],
        edges: [],
        rules: ruleService.getRulesForContext(ctx.repo.id),
        relatedFiles: [],
      };

      if (files && files.length > 0) {
        for (const file of files) {
          const subgraph = graphQuery.getSubgraph(ctx.repo.id, file, depth ?? 2);
          result.nodes.push(...subgraph.nodes);
          result.edges.push(...subgraph.edges);
          result.relatedFiles.push(
            ...subgraph.nodes.map((n) => n.filePath).filter((f) => !files.includes(f)),
          );
        }
      } else {
        result.nodes = graphQuery.listNodes(ctx.repo.id);
        result.edges = graphQuery.listEdges(ctx.repo.id);
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  mcpServer.tool(
    'get_rules',
    'List knowledge rules, optionally filtered',
    {
      repoPath: z.string().describe('Absolute path to the repository'),
      scope: z.string().optional(),
      type: z.enum(['constraint', 'lesson', 'preference']).optional(),
      active: z.boolean().optional(),
      includeCrossRepo: z.boolean().optional(),
    },
    async ({ repoPath, scope, type, active, includeCrossRepo }) => {
      const ctx = await repoRouter.resolve(repoPath);
      const rules = ruleService.listRules({
        repoId: ctx.repo.id,
        scope,
        type,
        active,
        includeCrossRepo,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ rules }, null, 2) }] };
    },
  );

  mcpServer.tool(
    'add_rule',
    'Add a new knowledge rule',
    {
      repoPath: z.string().optional().describe('Repository path (omit for cross-repo)'),
      type: z.enum(['constraint', 'lesson', 'preference']),
      content: z.string().describe('Rule text'),
      scope: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    async ({ repoPath, type, content, scope, tags }) => {
      let repoId: string | null = null;
      if (repoPath) {
        const ctx = await repoRouter.resolve(repoPath);
        repoId = ctx.repo.id;
      }
      const rule = ruleService.addRule({ repoId, type, content, scope: scope as 'cross-repo' | 'global' | undefined, tags });
      return { content: [{ type: 'text', text: JSON.stringify({ rule }, null, 2) }] };
    },
  );

  mcpServer.tool(
    'update_rule',
    'Update an existing knowledge rule',
    {
      id: z.string().describe('Rule ID'),
      content: z.string().optional(),
      scope: z.string().optional(),
      tags: z.array(z.string()).optional(),
      active: z.boolean().optional(),
    },
    async ({ id, content, scope, tags, active }) => {
      const rule = ruleService.updateRule({ id, content, scope: scope as 'cross-repo' | 'global' | undefined, tags, active });
      return { content: [{ type: 'text', text: JSON.stringify({ rule }, null, 2) }] };
    },
  );

  mcpServer.tool(
    'get_graph',
    'Query the dependency graph',
    {
      repoPath: z.string().describe('Absolute path to the repository'),
      file: z.string().optional().describe('Focus on a specific file'),
      depth: z.number().optional(),
      includeSymbols: z.boolean().optional(),
    },
    async ({ repoPath, file, depth }) => {
      const ctx = await repoRouter.resolve(repoPath);
      let result;
      if (file) {
        result = graphQuery.getSubgraph(ctx.repo.id, file, depth ?? 2);
      } else {
        result = {
          nodes: graphQuery.listNodes(ctx.repo.id),
          edges: graphQuery.listEdges(ctx.repo.id),
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  mcpServer.tool(
    'get_manifest',
    'Get current manifest state for a repository',
    { repoPath: z.string().describe('Absolute path to the repository') },
    async ({ repoPath }) => {
      const ctx = await repoRouter.resolve(repoPath);
      const manifest = manifestService.getManifest(ctx.repo.id);
      return { content: [{ type: 'text', text: JSON.stringify({ manifest }, null, 2) }] };
    },
  );

  mcpServer.tool(
    'init_kb',
    'Initialize or re-initialize a repository knowledge base',
    {
      repoPath: z.string().describe('Absolute path to the repository'),
      mode: z.enum(['current-branch', 'main', 'full', 'empty']).describe('Init mode'),
    },
    async ({ repoPath, mode }) => {
      const ctx = await repoRouter.resolve(repoPath);
      repoManager.updateStatus(ctx.repo.id, 'scanning');

      if (mode === 'empty') {
        storage.deleteGraphNodesForRepo(ctx.repo.id);
        repoManager.updateStatus(ctx.repo.id, 'ready');
        const manifest = await manifestService.generateManifest(ctx.repo.id, ctx.repo.path, 'init');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'ready',
              repoId: ctx.repo.id,
              filesIndexed: 0,
              nodesCreated: 0,
              edgesCreated: 0,
              manifest,
            }, null, 2),
          }],
        };
      }

      repoManager.updateStatus(ctx.repo.id, 'ready');
      const manifest = await manifestService.generateManifest(ctx.repo.id, ctx.repo.path, 'init');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'ready',
            repoId: ctx.repo.id,
            mode,
            manifest,
          }, null, 2),
        }],
      };
    },
  );

  // ─── MCP Resources ───────────────────────────────────────────────

  mcpServer.resource('repos', 'kb://repos', async () => ({
    contents: [{
      uri: 'kb://repos',
      mimeType: 'application/json',
      text: JSON.stringify(repoManager.listRepos(), null, 2),
    }],
  }));

  mcpServer.resource('cross-repo-rules', 'kb://rules/cross-repo', async () => ({
    contents: [{
      uri: 'kb://rules/cross-repo',
      mimeType: 'application/json',
      text: JSON.stringify(ruleService.listCrossRepoRules(), null, 2),
    }],
  }));

  // ─── Transport Setup ──────────────────────────────────────────────

  const transports = new Map<string, StreamableHTTPServerTransport>();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });

        transport.onclose = () => {
          const sid = [...transports.entries()].find(([_, t]) => t === transport)?.[0];
          if (sid) transports.delete(sid);
        };

        await mcpServer.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'No active session. Send an initialize request first.' });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  router.delete('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
    } else {
      res.status(204).end();
    }
  });

  return router;
}
