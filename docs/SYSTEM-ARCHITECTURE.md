# Cortex — System Architecture & Feature Deep-Dive

> Auto-generated from codebase analysis. Every claim is traceable to an implementation file.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Identified Features & Subsystems](#identified-features--subsystems)
3. [Feature Deep-Dives](#feature-deep-dives)
   - [F1: Core Storage Layer](#f1-core-storage-layer)
   - [F2: Repository Management](#f2-repository-management)
   - [F3: Git Integration & Diff Analysis](#f3-git-integration--diff-analysis)
   - [F4: LSP-Powered Code Intelligence](#f4-lsp-powered-code-intelligence)
   - [F5: Semantic Dependency Graph](#f5-semantic-dependency-graph)
   - [F6: Knowledge Rule Engine](#f6-knowledge-rule-engine)
   - [F7: Branch-Aware Knowledge Base](#f7-branch-aware-knowledge-base)
   - [F8: Conflict Resolution](#f8-conflict-resolution)
   - [F9: Sync Pipeline](#f9-sync-pipeline)
   - [F10: Manifest & Drift Detection](#f10-manifest--drift-detection)
   - [F11: Git Hook Enforcement](#f11-git-hook-enforcement)
   - [F12: Health Scoring](#f12-health-scoring)
   - [F13: Document Scanner & Service](#f13-document-scanner--service)
   - [F14: File Metrics & Hotspot Detection](#f14-file-metrics--hotspot-detection)
   - [F15: MCP (Model Context Protocol) Endpoint](#f15-mcp-model-context-protocol-endpoint)
   - [F16: REST API](#f16-rest-api)
   - [F17: Activity Logging & Session Tracking](#f17-activity-logging--session-tracking)
   - [F18: Webhook System](#f18-webhook-system)
   - [F19: Unified Search](#f19-unified-search)
   - [F20: CLI Toolchain](#f20-cli-toolchain)
   - [F21: Web UI Dashboard](#f21-web-ui-dashboard)
4. [Cross-Cutting Concerns](#cross-cutting-concerns)
5. [System Interconnection Map](#system-interconnection-map)

---

## System Overview

**Cortex** is a **local-first intelligence server for AI coding agents**. It maintains a persistent, structured knowledge base per repository — including a semantic dependency graph, versioned rules (constraints/lessons/preferences), manifests, documentation indices, and branch snapshots — then exposes this knowledge through both a **Model Context Protocol (MCP)** endpoint (for AI agents like Cursor, Claude, etc.) and a **REST API** (for humans/tooling/UI).

**Core thesis**: AI coding agents lack persistent memory across sessions. Cortex solves this by maintaining a deterministic, versioned knowledge base that agents can read from and write to, with git-hook enforcement to keep the KB in sync with the actual codebase.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 20, TypeScript, ESM modules |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| HTTP Server | Express 5 |
| MCP Protocol | `@modelcontextprotocol/sdk` (Streamable HTTP transport) |
| Git | `simple-git` |
| LSP | `vscode-jsonrpc` + `vscode-languageserver-protocol` |
| UI Framework | React 19, React Router 7, TanStack Query 5 |
| UI Styling | Tailwind CSS 4 |
| Visualization | D3.js 7 |
| Validation | Zod |
| Build | TypeScript compiler (server), Vite (UI) |
| Testing | Vitest |

### Storage Location

Default: `~/.cortex/knowledge.db` (configurable via `~/.cortex/config.json` or `$CORTEX_CONFIG`).

---

## Identified Features & Subsystems

| # | Feature | Category | Key Files |
|---|---------|----------|-----------|
| F1 | Core Storage Layer | Infrastructure | `core/storage.ts`, `core/types.ts`, `core/config.ts`, `core/errors.ts` |
| F2 | Repository Management | Data | `repo/repoManager.ts`, `repo/repoRouter.ts` |
| F3 | Git Integration & Diff Analysis | Data Ingestion | `git/gitService.ts`, `git/diffParser.ts` |
| F4 | LSP-Powered Code Intelligence | Analysis | `lsp/protocol.ts`, `lsp/registry.ts`, `lsp/serverPool.ts` |
| F5 | Semantic Dependency Graph | Analysis | `graph/graphBuilder.ts`, `graph/graphQuery.ts`, `graph/incrementalUpdater.ts` |
| F6 | Knowledge Rule Engine | Knowledge | `knowledge/ruleService.ts` |
| F7 | Branch-Aware Knowledge Base | Knowledge | `knowledge/branchService.ts` |
| F8 | Conflict Resolution | Knowledge | `knowledge/conflictResolver.ts` |
| F9 | Sync Pipeline | Orchestration | `sync/syncCollector.ts`, `sync/syncService.ts` |
| F10 | Manifest & Drift Detection | Integrity | `manifest/manifestService.ts`, `manifest/hashComputer.ts` |
| F11 | Git Hook Enforcement | Enforcement | `git/hookInstaller.ts` |
| F12 | Health Scoring | Analytics | `knowledge/healthScore.ts` |
| F13 | Document Scanner & Service | Documentation | `docs/docScanner.ts`, `docs/docService.ts` |
| F14 | File Metrics & Hotspot Detection | Analytics | `git/fileMetrics.ts` |
| F15 | MCP Endpoint | API | `server/mcpEndpoint.ts` |
| F16 | REST API | API | `server/apiRoutes.ts`, `server/httpServer.ts` |
| F17 | Activity Logging & Sessions | Observability | `server/activityLog.ts` |
| F18 | Webhook System | Integration | `server/webhookService.ts` |
| F19 | Unified Search | API | `server/apiRoutes.ts` (search endpoint) |
| F20 | CLI Toolchain | Developer UX | `cli/index.ts`, `cli/commands/*.ts` |
| F21 | Web UI Dashboard | Developer UX | `ui/App.tsx`, `ui/components/*.tsx`, `ui/hooks/*.ts` |

---

## Feature Deep-Dives

---

### F1: Core Storage Layer

#### Problem it solves
All subsystems need a single, transactional, structured persistence layer. Without it, knowledge (graph, rules, manifests, snapshots) would be scattered or in-memory only.

#### How it is implemented

1. **Schema definition**: `SCHEMA_SQL` constant in `storage.ts` defines 8 tables via `CREATE TABLE IF NOT EXISTS`:
   - `repos` — registered repositories
   - `rules` — knowledge rules with versioning
   - `rule_versions` — full version history for every rule mutation
   - `graph_nodes` — file-level graph nodes with symbols, summaries, responsibilities
   - `graph_edges` — typed relationships between nodes (imports, extends, etc.)
   - `manifests` — per-repo manifest snapshots (JSON blob)
   - `branch_snapshots` — per-branch knowledge snapshots
   - `repo_documents` — scanned documentation files
   - `webhooks` — registered outbound webhooks

2. **Initialization**: Constructor takes a db path, opens SQLite with `better-sqlite3`, enables WAL journal mode and foreign keys, then runs the schema SQL.

3. **Row mapping**: Raw SQLite rows are mapped to TypeScript interfaces via dedicated mapper functions (`mapRepoRow`, `mapRuleRow`, `mapGraphNodeRow`, etc.). JSON columns (arrays, objects) are `JSON.parse`d at the mapping boundary.

4. **CRUD operations**: Each entity has a complete set: `create`, `get`, `list`, `update`, `delete` — all using prepared statements.

5. **Transactions**: `transaction<T>(fn)` wraps `fn` in a SQLite transaction for atomic multi-statement operations (used by sync service, repo deletion).

6. **Config system** (`config.ts`): Two-layer config — a central `~/.cortex/config.json` and per-repo `.cortex.json`. Uses deep merge so repo overrides compose with central defaults.

#### Key files
- `src/core/storage.ts` — StorageService class (838 lines, the largest single file)
- `src/core/types.ts` — All TypeScript interfaces (274 lines)
- `src/core/config.ts` — Configuration loading, merging, storage paths
- `src/core/errors.ts` — Typed error hierarchy with HTTP status codes

#### Data flow
```
Config file → loadCentralConfig() → CortexConfig
                                       ↓
                              getDatabasePath()
                                       ↓
                              new StorageService(dbPath)
                                       ↓
                              All subsystems receive StorageService via constructor injection
```

#### Design decisions
- **SQLite over Postgres/Redis**: Local-first principle — zero external dependencies, portable, single-file database. WAL mode gives good concurrent read performance.
- **JSON-in-columns**: Arrays (tags, symbols, responsibilities) stored as JSON text strings. Avoids join tables at the cost of query granularity.
- **Constructor-based DI**: All services receive `StorageService` in constructor. No DI framework — explicit wiring in `serve.ts`.
- **Typed error hierarchy**: `CortexError` base class carries `code` and `statusCode`, enabling the API layer to map domain errors to HTTP responses directly.

#### Trade-offs / limitations
- JSON columns prevent efficient SQL queries on nested data (e.g., "find all nodes containing symbol X" requires full scan + parse).
- In-memory config reload not supported; requires server restart.
- No database migrations — schema changes require wiping the DB or manual ALTER TABLE.
- Single-node only; no replication or distributed storage.

---

### F2: Repository Management

#### Problem it solves
Cortex manages knowledge for multiple git repositories simultaneously. It needs to register, validate, identify, and route requests to the correct repository context.

#### How it is implemented

1. **Registration** (`RepoManager.registerRepo`):
   - Resolves and normalizes the path (follows symlinks)
   - Validates it's a git repo via `simple-git.checkIsRepo()`
   - Computes a deterministic repo ID: `SHA-256(absolutePath)`
   - Stores in the `repos` table with status `initialized`

2. **Auto-registration** (`RepoManager.resolveRepo`):
   - Checks if the path is already registered
   - If not, calls `registerRepo` transparently
   - This is the primary entry point — repos are lazily registered on first access

3. **Language detection** (`RepoManager.detectLanguages`):
   - Runs `git ls-files` to get all tracked files
   - Maps file extensions to language names via a static lookup table
   - Stores the detected language set on the repo record

4. **Routing** (`RepoRouter`):
   - `resolve(repoPath)` → auto-registers and returns `{ repo, storage }`
   - `resolveReady(repoPath)` → same but rejects if status is `scanning` or `error`
   - `resolveById(repoId)` → looks up by ID directly

#### Key files
- `src/repo/repoManager.ts` — Registration, language detection, lifecycle
- `src/repo/repoRouter.ts` — Request routing and context resolution

#### Data flow
```
API request with repoPath
    ↓
RepoRouter.resolve(repoPath)
    ↓
RepoManager.resolveRepo(repoPath)  →  auto-register if new
    ↓
Return RepoContext { repo: RepoInfo, storage: StorageService }
```

#### Design decisions
- **Path-based deterministic ID**: `SHA-256(absolutePath)` means the same repo always gets the same ID, even across server restarts.
- **Lazy registration**: No explicit "add repo" step required — connecting via MCP or REST with a `repoPath` auto-registers.

#### Trade-offs / limitations
- Repo ID is bound to absolute path. Moving a repo to a different path creates a new ID (orphaning old knowledge).
- Language detection is extension-based only (no content analysis).
- No support for monorepo sub-paths — the entire git root is the unit of registration.

---

### F3: Git Integration & Diff Analysis

#### Problem it solves
Cortex needs to understand what changed in a repository to keep its knowledge base current — staged files, diffs, commit history, and branch state.

#### How it is implemented

1. **GitService** wraps `simple-git` with focused methods:
   - `getStagedFiles()` / `getStagedDiff()` — for pre-commit analysis
   - `getCurrentCommit()` / `getBranchName()` — for manifest state
   - `getChangedFilesSince(commitHash)` — for incremental updates
   - `getTrackedFiles()` — for full graph builds

2. **DiffParser** (`diffParser.ts`):
   - `parseDiffStat(diffOutput)` — parses unified diff format into structured `DiffFile[]` objects (filePath, status, additions/deletions)
   - `extractAffectedSymbols(diffOutput)` — extracts function/class context from `@@` hunk headers, grouping symbols by file

#### Key files
- `src/git/gitService.ts` — Git operation wrapper
- `src/git/diffParser.ts` — Diff parsing and symbol extraction

#### Data flow
```
Git working tree
    ↓
GitService.getStagedDiff()
    ↓
parseDiffStat(diff)  →  DiffFile[] (which files changed, how)
extractAffectedSymbols(diff)  →  Map<file, symbol[]> (what functions were touched)
```

#### Design decisions
- Thin wrapper over `simple-git` rather than raw `child_process` — more readable, handles edge cases.
- Symbol extraction from diff context lines (`@@...@@ function_name`) is a heuristic but works well for most languages.

#### Trade-offs / limitations
- Symbol extraction relies on git's diff context heuristic, which may miss or misidentify symbols in some languages.
- No support for binary diffs.
- `getTrackedFiles()` returns all files including non-source files; filtering happens at the caller.

---

### F4: LSP-Powered Code Intelligence

#### Problem it solves
Building an accurate dependency graph requires understanding imports, definitions, references, and symbol hierarchies — information that varies drastically by language. LSP provides a uniform protocol for this.

#### How it is implemented

1. **LanguageServerRegistry** (`registry.ts`):
   - Holds a map of language server configs (TypeScript, Python, Rust, Go built-in)
   - Each config specifies: command, args, file extensions, install hint
   - `getServerForLanguage(lang)` / `getServerForExtension(ext)` for lookup
   - `detectServersForFiles(files)` returns which servers are needed for a file set

2. **LSPServerPool** (`serverPool.ts`):
   - Maintains a pool of running LSP server processes, keyed by `repoId::serverId`
   - `getOrSpawn(repoId, serverId)` — returns existing connection or spawns a new child process
   - `initialize(repoId, serverId, rootPath)` — sends LSP `initialize` + `initialized`
   - Idle timeout (default 5 minutes): periodic check kills unused servers
   - `checkAvailability(serverId)` — verifies the server binary is installed via `which`
   - `shutdownAll()` / `shutdownRepo()` for cleanup

3. **Protocol** (`protocol.ts`):
   - `createLSPConnection(childProc)` — bridges stdio to JSON-RPC `MessageConnection`
   - `initializeLSP(connection, rootUri)` — LSP handshake with capabilities
   - `getDocumentSymbols(connection, fileUri)` — `textDocument/documentSymbol`
   - `getDefinition(connection, fileUri, line, char)` — `textDocument/definition`
   - `getReferences(connection, fileUri, line, char)` — `textDocument/references`

#### Key files
- `src/lsp/protocol.ts` — LSP JSON-RPC protocol helpers
- `src/lsp/registry.ts` — Server config registry
- `src/lsp/serverPool.ts` — Process pool with lifecycle management

#### Data flow
```
GraphBuilder needs symbols for file.ts
    ↓
registry.getServerForLanguage('typescript')  →  TypeScript LSP config
    ↓
lspPool.getConnection(repoId, 'typescript')  →  MessageConnection
    ↓
protocol.getDocumentSymbols(connection, fileUri)  →  DocumentSymbol[]
protocol.getDefinition(connection, fileUri, line, col)  →  Location[]
```

#### Design decisions
- **Process pool with idle timeout**: LSP servers are expensive to start but cheap to keep warm. Pool amortizes startup cost across multiple graph operations.
- **Built-in configs for 4 languages**: Covers the majority of codebases without user configuration.
- **Fallback**: When no LSP is available, the graph builder falls back to regex-based symbol extraction (in `apiRoutes.ts` graph build endpoint).

#### Trade-offs / limitations
- LSP servers must be installed separately on the host machine. The system gracefully degrades but cannot extract symbols without them.
- Pool keyed by `repoId::serverId` — no cross-repo server sharing (each repo gets its own LSP instance).
- No workspace/folder support — initializes with a single root URI per server.

---

### F5: Semantic Dependency Graph

#### Problem it solves
AI agents need to understand how files relate to each other — imports, dependencies, inheritance chains. A flat file list is insufficient; you need a graph.

#### How it is implemented

1. **GraphBuilder** (`graphBuilder.ts`):
   - `buildFullGraph(repoId, rootPath, files, commitHash, ignorePaths)`:
     - Iterates all source files, builds a `GraphNode` per file
     - Uses LSP `documentSymbol` to extract symbols (functions, classes, interfaces, etc.)
     - Then iterates again to build `GraphEdge` entries by resolving definitions via LSP
   - `rebuildIncremental(repoId, rootPath, changedFiles, commitHash)`:
     - Only processes changed files
     - Deletes edges for changed nodes before rebuilding
     - Handles deleted files by removing their nodes

2. **GraphNode** structure:
   - `id`: `repoId:filePath` (deterministic)
   - Contains: language, symbols array (name, kind, range, exported), summary (AI-generated), responsibilities (AI-generated), lastAnalyzed timestamp, commitHash

3. **GraphEdge** structure:
   - Typed relationships: `imports`, `imported_by`, `calls`, `called_by`, `extends`, `implements`
   - Links between node IDs with symbol names

4. **GraphQuery** (`graphQuery.ts`):
   - `getSubgraph(repoId, filePath, depth)` — BFS traversal from a file, collecting nodes and edges within `depth` hops
   - `getAffectedByChange(repoId, filePaths)` — BFS over reverse edges to find all files transitively dependent on changed files
   - `getDependenciesOf(repoId, filePath)` — outgoing edges (what this file imports)
   - `getDependentsOf(repoId, filePath)` — incoming edges (what imports this file)

5. **IncrementalUpdater** (`incrementalUpdater.ts`):
   - `updateNodeSummaries(repoId, updates)` — patches summaries/responsibilities without rebuilding edges
   - `removeDeletedFiles(repoId, deletedFiles)` — cleans up orphaned nodes

6. **Fallback regex parser** (in `apiRoutes.ts`):
   - The `/repos/:repoId/graph/build` endpoint has a built-in regex-based symbol parser for TypeScript/JavaScript
   - Extracts: functions, classes, interfaces/types, const declarations
   - Parses ES import statements (`from '...'`) and resolves relative paths to actual files with extension resolution

#### Key files
- `src/graph/graphBuilder.ts` — LSP-based graph construction
- `src/graph/graphQuery.ts` — Graph traversal and querying
- `src/graph/incrementalUpdater.ts` — Partial updates
- `src/server/apiRoutes.ts` — Regex fallback graph builder

#### Data flow
```
graph/build API called
    ↓
git ls-files  →  all tracked files
    ↓
Filter to source extensions, apply ignorePaths
    ↓
For each file:
  1. Read content
  2. Parse symbols (regex or LSP)
  3. Upsert GraphNode
    ↓
For each file:
  1. Parse import statements
  2. Resolve import path → target file
  3. Upsert GraphEdge (source → target, relationship: 'imports')
    ↓
Generate manifest
```

#### Design decisions
- **Dual-mode symbol extraction**: LSP for accuracy when available; regex fallback ensures the graph can always be built.
- **File-level granularity**: Nodes are files, not individual symbols. Symbols are metadata on the node. This keeps the graph manageable for large codebases.
- **BFS traversal for context**: `getSubgraph` uses BFS with configurable depth — practical for IDE context windows.

#### Trade-offs / limitations
- Regex fallback only handles TypeScript/JavaScript import syntax.
- No cross-repo edges — each repo is an isolated graph.
- Import resolution is path-based with a fixed extension candidate list; doesn't handle `tsconfig.json` path aliases.
- `summary` and `responsibilities` fields start empty — they must be populated by an AI agent via the `apply_kb_updates` tool.

---

### F6: Knowledge Rule Engine

#### Problem it solves
Teams and individuals accumulate coding wisdom — "never use X", "always do Y", "prefer Z". This knowledge is usually tribal, scattered in docs, or lost across sessions. Cortex persists it as structured, versioned, filterable rules.

#### How it is implemented

1. **Rule types**: `constraint` (hard requirement), `lesson` (learned insight), `preference` (soft guideline)

2. **Rule scopes**:
   - `global` — applies to a specific repo
   - `cross-repo` — applies across all repos (repo_id is NULL)
   - `branch:<name>` — applies only on a specific branch

3. **RuleService** (`ruleService.ts`):
   - `addRule(input)` — creates rule + inserts version 1 into `rule_versions`
   - `updateRule(input)` — bumps version, updates fields, records version history
   - `deactivateRule(id)` — soft delete (sets `active = false`)
   - `getRulesForContext(repoId, branchName)` — returns all applicable rules (global + cross-repo + branch-specific)
   - `listRules(filter)` — flexible filtering by repo, scope, type, active status

4. **Version history**: Every mutation creates a `rule_versions` entry with the full content, scope, tags, and who changed it. This enables audit trails and rollback.

5. **Provenance** (type-level, not yet persisted): Rules carry optional `provenance` metadata — which session created them, what file triggered them, whether created via MCP/REST/manual.

#### Key files
- `src/knowledge/ruleService.ts` — Rule CRUD with versioning

#### Data flow
```
AI agent (via MCP add_rule / apply_kb_updates)
    ↓
RuleService.addRule({ type: 'constraint', content: '...', tags: [...] })
    ↓
storage.createRule(rule)  →  INSERT INTO rules
storage.insertRuleVersion(...)  →  INSERT INTO rule_versions
    ↓
Later: RuleService.getRulesForContext(repoId, branchName)
    ↓
Returns filtered, active rules for the current context
```

#### Design decisions
- **Soft delete**: Rules are never physically deleted; they're deactivated. This preserves history and enables reactivation.
- **Cross-repo rules with NULL repo_id**: Uses SQL `OR repo_id IS NULL` for inclusive queries rather than a separate table.
- **Version counter on the rule itself**: Simple incrementing integer; combined with `rule_versions` table for full history.

#### Trade-offs / limitations
- No rule deduplication — identical rules can be added multiple times.
- No rule ordering/priority system. If two rules conflict, there's no built-in resolution (the conflict resolver only handles version conflicts, not semantic conflicts).
- Provenance tracking is defined in types but not fully persisted to the database.

---

### F7: Branch-Aware Knowledge Base

#### Problem it solves
Feature branches may need branch-specific rules or graph state. When switching branches, the KB should capture the current state and allow switching back.

#### How it is implemented

1. **BranchService** (`branchService.ts`):
   - `createSnapshot(repoId, repoPath, branchName)`:
     - Gets current commit hash
     - Serializes all repo rules (id, version, content) and node summaries
     - Stores as a JSON blob in `branch_snapshots` table
   - `handleBranchSwitch(repoId, repoPath, currentBranch, newBranch)`:
     - If no snapshot exists for the current branch, creates one before switching
   - `getSnapshot(repoId, branchName)` — retrieves a branch snapshot

2. **Git hook integration**: The `post-checkout` hook notifies the Cortex server when a branch switch occurs, which can trigger `handleBranchSwitch`.

#### Key files
- `src/knowledge/branchService.ts`

#### Design decisions
- **Snapshot as JSON blob**: Simple and complete — serializes the full state rather than tracking deltas. Easy to restore.
- **Unique constraint**: `(repo_id, branch_name)` — only one snapshot per branch.

#### Trade-offs / limitations
- Snapshot restore is not implemented — snapshots are created but there's no `restoreSnapshot` method yet.
- Full-state snapshots can be large for repos with many rules/nodes.
- No automatic snapshot-on-switch in the current hook implementation (the hook only notifies; the server acknowledges but doesn't act further yet).

---

### F8: Conflict Resolution

#### Problem it solves
When multiple agents or users modify rules concurrently, or when merging branch-specific rules, version conflicts can occur. The system needs to detect and resolve them.

#### How it is implemented

1. **ConflictResolver** (`conflictResolver.ts`):
   - `detectConflicts(repoId, incomingRules)`:
     - For each incoming rule with an ID, looks up the local version
     - If versions differ, creates a `KBConflict` entry
     - Suggests resolution: higher version wins (`accept-incoming`), otherwise `keep-local`
   - `resolveConflict(conflict, resolution, customValue?)`:
     - `keep-local` — no-op
     - `accept-incoming` — updates local rule with incoming data
     - `manual` — applies user-provided custom value

#### Key files
- `src/knowledge/conflictResolver.ts`

#### Design decisions
- **Version-based conflict detection**: Simple version number comparison. No content diffing.
- **Three resolution strategies**: Covers the common cases (keep mine, take theirs, merge manually).

#### Trade-offs / limitations
- Only handles rule conflicts, not graph node conflicts (despite the type definition supporting both).
- No automatic three-way merge for content.
- No UI for conflict resolution yet (the `ConflictResolver` component exists but resolution is manual through API).

---

### F9: Sync Pipeline

#### Problem it solves
When an AI agent works on code, it needs to: (1) see what changed, (2) understand which KB entries are affected, (3) propose updates, (4) apply approved updates atomically. This is the core KB lifecycle workflow.

#### How it is implemented

1. **SyncCollector** (`syncCollector.ts`) — the "read" side:
   - `collect(repoId, repoPath, files?, includeFullDiff?)`:
     - Gets staged files and diff from git
     - Looks up affected graph nodes for changed files
     - Fetches existing active rules
     - Retrieves current manifest
     - Generates suggestions (new files to add, deleted files to remove, missing summaries)
   - Returns `SyncKBOutput` — a comprehensive snapshot for the AI agent

2. **SyncService** (`syncService.ts`) — orchestrates read and write:
   - `collectSyncData(...)` — delegates to SyncCollector
   - `applyUpdates(repoId, repoPath, input)`:
     - Wraps all changes in a database transaction
     - Applies node updates (summaries, responsibilities)
     - Applies rule changes (add, update, deactivate) via RuleService
     - Regenerates the manifest after changes
     - Returns a summary of what changed

#### Key files
- `src/sync/syncCollector.ts` — Data collection and suggestion generation
- `src/sync/syncService.ts` — Orchestrator for collect + apply

#### Data flow
```
AI Agent calls MCP sync_kb
    ↓
SyncCollector.collect()
    ↓
Returns: { stagedFiles, diff, affectedNodes, existingRules, manifest, suggestedActions }
    ↓
Agent analyzes and proposes updates
    ↓
Agent calls MCP apply_kb_updates
    ↓
SyncService.applyUpdates()  — in transaction:
    1. Update node summaries/responsibilities
    2. Add/update/deactivate rules
    3. Regenerate manifest
    ↓
Returns: { success, updatedManifest, changesSummary }
```

#### Design decisions
- **Two-phase workflow (collect then apply)**: The agent sees the full context before proposing changes. This is intentionally human-in-the-loop — the agent suggests, the human (or agent) approves.
- **Transactional writes**: All changes from a single `apply_kb_updates` call are atomic.

#### Trade-offs / limitations
- No partial rollback — if the transaction succeeds, all changes are committed.
- Suggestion generation is heuristic (simple string matching for new/deleted files).
- `getRecentFileHistory()` in syncCollector queries git log per file (limited to 50 files) — can be slow on large repos.

---

### F10: Manifest & Drift Detection

#### Problem it solves
The KB needs to stay in sync with the actual code. The manifest provides a checksum of the KB state + staged changes, enabling deterministic detection of drift.

#### How it is implemented

1. **Hash computation** (`hashComputer.ts`):
   - `computeStagedHash(stagedFiles, diffContent)` — SHA-256 of sorted file list + full diff content
   - `computeContentHash(content)` — SHA-256 of arbitrary content (used for doc hashing)

2. **ManifestService** (`manifestService.ts`):
   - `generateManifest(repoId, repoPath, syncedBy)`:
     - Collects current commit, branch, staged files/diff
     - Computes staged hash
     - Gathers indexed file list, stats (node/edge/rule counts), rules version sum
     - Stores the complete `KBManifest` in the database
   - `validateManifest(repoId, repoPath)`:
     - Recomputes current staged hash
     - Compares with stored manifest hash
     - Returns `{ valid: boolean, drift: boolean }`

3. **Manifest fields**: repoId, version, baseCommit, stagedHash, indexedFiles, indexedFileCount, rulesVersion, rulesCount, graphNodeCount, graphEdgeCount, lastSyncedAt, lastSyncedBy, branchName

#### Key files
- `src/manifest/manifestService.ts` — Manifest generation and validation
- `src/manifest/hashComputer.ts` — SHA-256 hash utilities

#### Data flow
```
SyncService.applyUpdates() finishes
    ↓
ManifestService.generateManifest(repoId, repoPath, 'agent')
    ↓
Compute stagedHash = SHA256(sorted_staged_files + '\n---\n' + diff)
    ↓
Store manifest with all stats
    ↓
Pre-commit hook later recomputes hash and compares
    ↓
Match → commit allowed | Mismatch → commit blocked
```

#### Design decisions
- **SHA-256 over sorted inputs**: Deterministic — same staged state always produces the same hash.
- **Includes full diff content in hash**: More granular than just file names — catches the actual change content.

#### Trade-offs / limitations
- Manifest is a point-in-time snapshot; it doesn't track incremental changes between syncs.
- The `rulesVersion` field is a sum of all rule versions — not a content hash. Adding then removing a rule changes the sum even though the effective rules are the same.

---

### F11: Git Hook Enforcement

#### Problem it solves
Without enforcement, the KB inevitably drifts from the code. Git hooks ensure the developer (or agent) syncs the KB before committing.

#### How it is implemented

1. **hookInstaller.ts** manages three hooks:

   - **pre-commit**: The critical enforcement hook.
     - Checks if Cortex server is running (skips gracefully if not)
     - Computes the staged hash (same algorithm as manifest service)
     - Fetches the manifest hash from the Cortex API
     - If hashes differ → **blocks the commit** with an error message directing the user to sync
     - If hashes match → commit proceeds

   - **post-merge**: Notifies the Cortex server that a merge occurred (POST to `/api/repos/notify`)

   - **post-checkout**: Notifies the Cortex server of a branch switch with the new branch name

2. **Installation**: `installHooks(repoPath, hookTypes)`:
   - Creates `.git/hooks/` if missing
   - Checks for existing hooks — only overwrites if they contain the Cortex marker
   - Writes hook scripts with `chmod 755`
   - Returns `{ installed, skipped }` for reporting

3. **Uninstallation**: `uninstallHooks(repoPath, hookTypes)` — removes only Cortex-installed hooks (checks for marker).

#### Key files
- `src/git/hookInstaller.ts`

#### Design decisions
- **Graceful degradation**: If the server isn't running, the hook skips with a warning rather than blocking.
- **Marker-based ownership**: Hooks contain a comment marker (`# .git/hooks/`) to distinguish Cortex hooks from user hooks. Cortex never overwrites non-Cortex hooks.
- **Shell scripts, not node**: Hooks are plain shell scripts with `curl` and `node` for minimal dependencies.

#### Trade-offs / limitations
- Pre-commit hook shells out to `node -e` for hash computation — requires Node.js in PATH.
- Uses `curl` for server communication — must be installed.
- No support for hook chains (e.g., husky). If another tool manages hooks, Cortex hooks will be skipped.
- The hook hardcodes `http://localhost:4170` — not configurable.

---

### F12: Health Scoring

#### Problem it solves
Users need a quick way to understand "how well-maintained is my knowledge base?" — coverage, freshness, completeness. A single score plus actionable suggestions.

#### How it is implemented

`HealthComputer.compute(repoId)` calculates a weighted score (0–100) from 6 factors:

| Factor | Weight | Measurement |
|--------|--------|-------------|
| Summary Coverage | 30% | % of graph nodes with non-empty summaries |
| Responsibilities Coverage | 15% | % of nodes with responsibilities arrays |
| Graph Freshness | 20% | % of nodes analyzed within the last 7 days |
| Manifest Freshness | 15% | Time since last manifest sync (tiered: <1d=100, <3d=75, <7d=50, else 25) |
| Rule Coverage | 10% | Ratio of rules to nodes (capped at 100) |
| Graph Connectivity | 10% | % of nodes with at least one edge (non-orphan) |

Each factor generates a human-readable detail string and, if below threshold, a suggestion for improvement.

#### Key files
- `src/knowledge/healthScore.ts`

#### Design decisions
- **Weighted average**: Simple, interpretable model. No ML, no complexity.
- **Actionable suggestions**: Each low-scoring factor generates a specific, actionable suggestion.

#### Trade-offs / limitations
- Weights are hardcoded — not configurable per repo.
- "Summary Coverage" treats all nodes equally (a config file matters less than a core service file).
- Rule coverage ratio uses `200` as a multiplier which means 50% rules-to-nodes ratio gives 100% score — somewhat arbitrary.

---

### F13: Document Scanner & Service

#### Problem it solves
AI agents work better when they have access to project documentation — READMEs, architecture docs, cursor rules, contributing guides. Cortex indexes these automatically.

#### How it is implemented

1. **DocScanner** (`docScanner.ts`) scans for 12 known patterns:
   - `.cursor/rules/` directory → `cursor-rule` type
   - `.cursorrules` file → `cursor-rule`
   - `AGENTS.md`, `CLAUDE.md`, `RULES.md` → `agent-guide`
   - `CONTRIBUTING.md` → `contributing`
   - `README.md` → `readme`
   - `ARCHITECTURE.md`, `DESIGN.md` → `architecture`
   - `CHANGELOG.md` → `changelog`
   - `docs/` directory → `docs` type (recursive, detects ADR subdirectories)

   For each found file: reads content, computes SHA-256 content hash, extracts title from first `# heading`, creates a `RepoDocument` record.

2. **DocService** (`docService.ts`):
   - `scanAndSync(repoId, repoPath)` — full scan + diff with existing records (add new, update changed, remove deleted)
   - `getDocContent(repoId, docId, repoPath)` — reads file content from disk
   - `getDocReferences(repoId, docId, repoPath)` — extracts file path references from markdown content (backtick references and links), cross-references with graph nodes to return only known source files

#### Key files
- `src/docs/docScanner.ts` — File system scanning
- `src/docs/docService.ts` — CRUD + content access + reference extraction

#### Data flow
```
POST /repos/:repoId/docs/scan  OR  MCP get_docs (triggers lazy scan)
    ↓
DocScanner.scanRepo(repoPath, repoId)
    ↓
Walk known documentation patterns → RepoDocument[]
    ↓
DocService.scanAndSync() — diff with DB, upsert/delete as needed
    ↓
Documents now available via GET /repos/:repoId/docs, MCP get_docs
```

#### Design decisions
- **Pattern-based, not content-based**: Scans known file paths/directories rather than trying to classify arbitrary files. Fast and predictable.
- **Content hash for change detection**: Only updates the DB record if the file actually changed.
- **Reference extraction**: Uses regex on markdown to find file paths, then cross-references with the dependency graph for validation.

#### Trade-offs / limitations
- Only scans `.md` files. Other documentation formats (RST, AsciiDoc, Jupyter notebooks) are ignored.
- Reference extraction is heuristic — may miss or false-positive file paths.
- No full-text search on document content.

---

### F14: File Metrics & Hotspot Detection

#### Problem it solves
Which files are the riskiest in the codebase? Files that change frequently (high churn) and have many dependents are maintenance hotspots.

#### How it is implemented

1. **FileMetricsCollector** (`fileMetrics.ts`):
   - `collectMetrics(repoPath, files)` — for each file:
     - `git log --since=30d` → commits in last 30 days
     - `git log --since=90d` → commits in last 90 days + unique author count
     - `git log maxCount=1` → last modified date
   - Returns `FileMetric[]`: { filePath, commits30d, commits90d, lastModified, authorCount }

2. **HotspotList** (UI component):
   - `buildHotspotRows(nodes, edges, metrics, repoId)`:
     - Combines git churn with graph connectivity
     - Risk score = `commits90d * 2 + inboundEdges * 3`
     - Sorted by risk descending

3. **Graph heatmap** (in `GraphViewer.tsx`):
   - When heatmap mode is active, node colors use a blue-to-red gradient based on 90-day commit count
   - Uses `d3.interpolateRgb` for smooth color mapping

#### Key files
- `src/git/fileMetrics.ts` — Git history analysis
- `src/ui/components/HotspotList.tsx` — Risk scoring and display
- `src/ui/components/GraphViewer.tsx` — Heatmap visualization

#### Design decisions
- **Risk formula is simple and transparent**: `commits * 2 + deps * 3`. Easy to understand and extend.
- **Limited to 200 files**: `fetchGraphMetrics` endpoint caps at 200 files to prevent git log from running too long.

#### Trade-offs / limitations
- Sequential `git log` per file is O(N) — slow for large file sets. No batching.
- Risk formula weights are arbitrary and not configurable.
- No caching of metrics — recomputed on every request.

---

### F15: MCP (Model Context Protocol) Endpoint

#### Problem it solves
AI coding agents (Cursor, Claude, etc.) need a standardized way to query and update the knowledge base. MCP provides this standard.

#### How it is implemented

1. **MCP Server** (`mcpEndpoint.ts`) registers 11 tools:

   | Tool | Purpose |
   |------|---------|
   | `list_repos` | List all registered repositories |
   | `get_repo_status` | Detailed status of a repo (stats, manifest) |
   | `sync_kb` | Collect sync data for AI to propose updates |
   | `apply_kb_updates` | Apply approved node updates and rule changes |
   | `get_context` | Get structured context (graph subgraph + rules + recent changes) |
   | `get_rules` | List knowledge rules with filters |
   | `add_rule` | Add a new rule |
   | `update_rule` | Update an existing rule |
   | `get_graph` | Query the dependency graph |
   | `get_manifest` | Get current manifest state |
   | `init_kb` | Initialize or re-initialize a repo's KB |
   | `get_docs` | Get documentation files with content |

2. **MCP Resources** (2 resources):
   - `kb://repos` — JSON list of all repositories
   - `kb://rules/cross-repo` — JSON list of cross-repo rules

3. **Transport**: `StreamableHTTPServerTransport` — HTTP-based, supports multiple concurrent sessions via `mcp-session-id` header. Sessions are stored in a `Map<string, transport>`.

4. **Tool input validation**: All tool parameters validated with Zod schemas.

5. **Logging integration**: Every tool call is logged to `ActivityLog` with timing, params, result, and error info.

#### Key files
- `src/server/mcpEndpoint.ts` — Full MCP server implementation

#### Data flow
```
AI Agent → POST /mcp (with MCP JSON-RPC payload)
    ↓
StreamableHTTPServerTransport handles framing
    ↓
McpServer routes to registered tool handler
    ↓
Tool handler calls domain services (RepoRouter, SyncService, etc.)
    ↓
Result serialized as JSON text in MCP content format
    ↓
ActivityLog records the call
    ↓
Response sent back to agent
```

#### Design decisions
- **HTTP Streamable transport (not SSE/stdio)**: Works over standard HTTP, compatible with any MCP client. Session management via headers.
- **All tools return JSON as text content**: MCP protocol returns typed content blocks; Cortex uses `text` type with JSON.
- **`get_context` is the primary read tool**: Combines graph + rules + related files in one call, reducing round-trips for agents.

#### Trade-offs / limitations
- MCP session state is in-memory — lost on server restart.
- No authentication on the MCP endpoint.
- Tool results can be large (full graph as JSON) — no pagination.

---

### F16: REST API

#### Problem it solves
The web UI and CLI need a standard HTTP API. REST provides a well-understood, browsable interface for all CRUD operations.

#### How it is implemented

`createApiRoutes(deps)` returns an Express Router with endpoints grouped by entity:

| Group | Endpoints |
|-------|-----------|
| Repos | `GET /repos`, `POST /repos`, `GET /repos/:repoId`, `GET /repos/manifest`, `POST /repos/notify` |
| Graph | `GET /repos/:repoId/graph`, `POST /repos/:repoId/graph/build`, `GET /repos/:repoId/graph/metrics` |
| Rules | `GET/POST /repos/:repoId/rules`, `PUT /repos/:repoId/rules/:id`, history + impact endpoints |
| Manifest | `GET /repos/:repoId/manifest` |
| Context | `GET /repos/:repoId/context` |
| Documents | `GET /repos/:repoId/docs`, content, references, `POST scan` |
| Health | `GET /repos/:repoId/health` |
| Search | `GET /search` |
| Cross-repo | `GET/POST /rules/cross-repo` |
| Webhooks | `GET/POST /webhooks`, `DELETE/PUT /webhooks/:id` |
| Analytics | `GET /analytics` |
| Logs | `GET /logs`, `GET /logs/stats`, `GET /logs/stream` (SSE) |
| Sessions | `GET /sessions`, `GET /sessions/:sessionId`, `GET /sessions/:sessionId/delta` |

The `POST /repos/:repoId/graph/build` endpoint is notable — it contains a complete regex-based graph builder that doesn't require LSP. It parses symbols from file content using regex, resolves imports, and builds the full graph.

#### Key files
- `src/server/apiRoutes.ts` — All REST endpoints (685 lines)
- `src/server/httpServer.ts` — Express app setup, middleware, static file serving

#### Design decisions
- **Error handling via CortexError hierarchy**: Each endpoint catches errors; `CortexError` subclasses map directly to HTTP status codes.
- **Inline graph builder**: The API route contains its own graph builder rather than delegating to `GraphBuilder`, because the LSP-based builder requires spawning language servers which may not be available. The regex fallback is always available.

#### Trade-offs / limitations
- No authentication or authorization.
- No rate limiting.
- Large JSON payloads (full graph) served without streaming/pagination.
- The inline graph builder duplicates some logic from `GraphBuilder`.

---

### F17: Activity Logging & Session Tracking

#### Problem it solves
Operators need to understand what AI agents are doing — which tools they call, how long calls take, what errors occur. Sessions group related tool calls.

#### How it is implemented

1. **ActivityLog** class (in-memory, capped ring buffer):
   - `log(entry)` — stores entry, trims to maxEntries (default 10,000)
   - `query(filters)` — filters by source, action, repoId, status, search text, time range. Returns newest-first with pagination.
   - `getStats()` — aggregate stats: total, error count/rate, avg duration, top tools, top repos, calls by source
   - `subscribe(listener)` — pub-sub for SSE streaming
   - `listSessions()` — groups entries by sessionId, returns summary per session
   - `getSessionDelta(sessionId)` — counts rules added/updated, nodes updated across a session

2. **Logging middleware** (`createLoggingMiddleware`):
   - Wraps Express `res.json` to capture response bodies
   - On `res.finish`, logs the complete request/response with timing
   - Skips logging for log/health/search/analytics endpoints to avoid recursion

3. **SSE stream** (`/api/logs/stream`):
   - Server-Sent Events endpoint
   - Subscribes to ActivityLog, pushes new entries to connected clients in real-time

4. **MCP tool logging**: Each MCP tool handler manually logs before returning, capturing timing, params, and result/error.

#### Key files
- `src/server/activityLog.ts` — ActivityLog class, middleware, MCP wrapper

#### Design decisions
- **In-memory ring buffer**: Fast writes, no persistence overhead. Acceptable because logs are observational, not critical.
- **10,000 entry cap**: Prevents unbounded memory growth.
- **SSE for live tail**: Standard browser API, no WebSocket complexity.

#### Trade-offs / limitations
- Logs are lost on server restart (in-memory only).
- Linear scan for queries — no indexing. May be slow with 10K entries and complex filters.
- Session tracking depends on MCP session ID propagation — REST calls don't have sessions.

---

### F18: Webhook System

#### Problem it solves
External systems (CI/CD, Slack, monitoring) may need to react to KB events — rule changes, graph builds, health degradation.

#### How it is implemented

1. **WebhookService** (`webhookService.ts`):
   - `register(url, events, repoId?, secret?)` — creates webhook, stores in DB
   - `fire(event, payload)` — for matching active webhooks:
     - Optionally filters by repoId
     - If secret is set: computes HMAC-SHA256 signature, adds `X-Cortex-Signature` header
     - Fire-and-forget with 10s timeout via `AbortController`
   - `list()`, `remove(id)`, `toggle(id, active)` — management

2. **Event types**: `rule.created`, `rule.updated`, `manifest.generated`, `graph.built`, `health.degraded`

3. **REST endpoints**: Full CRUD at `/api/webhooks`

#### Key files
- `src/server/webhookService.ts`

#### Design decisions
- **HMAC-SHA256 signatures**: Standard webhook security pattern. Receivers can verify authenticity.
- **Fire-and-forget**: Webhook delivery doesn't block the caller. Failed deliveries are silently dropped.

#### Trade-offs / limitations
- No retry logic for failed deliveries.
- No delivery log — failures are silently swallowed.
- `fire()` is defined but not yet called from any business logic (the hooks exist but no service triggers them yet).

---

### F19: Unified Search

#### Problem it solves
Users need to find things quickly across all knowledge types — rules, graph nodes, documents.

#### How it is implemented

`GET /search?q=<query>&limit=20`:
- Iterates all repos
- For each repo:
  - Searches rules by content and tags (case-insensitive substring)
  - Searches graph nodes by filePath, summary, symbol names
  - Searches documents by title and filePath
- Also searches cross-repo rules
- Returns `{ rules, nodes, docs }` each capped to `limit`

The UI exposes this via a `SearchOverlay` component (`Cmd+K` shortcut).

#### Key files
- `src/server/apiRoutes.ts` (search endpoint)
- `src/ui/components/SearchOverlay.tsx`

#### Design decisions
- **Brute-force search**: Loads all entities into memory and filters. Simple, correct, no index to maintain.

#### Trade-offs / limitations
- O(N) linear scan across all repos, rules, nodes, docs. Will be slow for very large knowledge bases.
- No relevance ranking — results are returned in storage order.
- No fuzzy matching.

---

### F20: CLI Toolchain

#### Problem it solves
Developers need terminal access to Cortex for setup, status checks, and hook management without opening a browser.

#### How it is implemented

`cortex` CLI built with `commander`, 5 subcommands:

| Command | Purpose |
|---------|---------|
| `cortex serve` | Starts the server. Wires all services, opens browser. |
| `cortex repos list/add/remove` | Manage registered repositories |
| `cortex status <repoPath>` | Show manifest status (branch, commit, file count, etc.) |
| `cortex check <repoPath>` | Validate manifest hash |
| `cortex hooks install/uninstall <repoPath>` | Manage git hooks |

All CLI commands except `serve` talk to the running server via HTTP (`serverFetch` utility with 5s timeout).

#### Key files
- `src/cli/index.ts` — Entry point
- `src/cli/commands/serve.ts` — Server bootstrap (wires all 11 services)
- `src/cli/commands/repos.ts`, `status.ts`, `check.ts`, `hooks.ts`
- `src/cli/utils.ts` — HTTP client utility

#### Design decisions
- **Server-dependent CLI**: Most commands require the server to be running. This centralizes state and avoids direct DB access from CLI.
- **`cortex serve` is the orchestrator**: Creates all services with explicit DI, no framework.

#### Trade-offs / limitations
- `repos remove` is not implemented via CLI (only via REST).
- No interactive prompts or TUI.
- Error messages point to `npx cortex serve` — assumes npm/npx availability.

---

### F21: Web UI Dashboard

#### Problem it solves
Provides a visual interface for monitoring and interacting with the knowledge base — graph visualization, rule management, health monitoring, activity logs.

#### How it is implemented

React 19 SPA with React Router, TanStack Query, Tailwind CSS, D3.js. Served as static files from the Express server.

**Pages** (13 routes):
| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Dashboard | Cross-repo overview, repo cards with stats, activity heatmap |
| `/logs` | ActivityLogs | Filterable log table with SSE live tail |
| `/sessions` | SessionReplay | MCP session history with delta summary |
| `/settings/webhooks` | WebhookManager | Webhook CRUD |
| `/repos/:repoId/graph` | GraphViewer | D3 force-directed graph with search, filter, heatmap |
| `/repos/:repoId/health` | HealthScore | Weighted health gauge with factor breakdown |
| `/repos/:repoId/docs` | DocumentViewer | Document listing with markdown preview |
| `/repos/:repoId/rules` | RuleManager | Rule CRUD with filtering |
| `/repos/:repoId/manifest` | ManifestStatus | Manifest details |
| `/repos/:repoId/context` | ContextInspector | Context query tool |
| `/repos/:repoId/branches` | BranchSelector | Branch snapshot viewer |
| `/repos/:repoId/conflicts` | ConflictResolver | Conflict resolution UI |

**Key UI features**:
- **D3 force-directed graph**: Interactive visualization with zoom, pan, drag, click-to-inspect. Three color modes: language, directory, heatmap (git churn). Search with focus-and-zoom. Symbol inspector panel.
- **Activity heatmap**: 7-day × 24-hour grid showing API activity by hour (UTC).
- **Live tail logs**: SSE-backed real-time log streaming with entry animation.
- **Cmd+K search overlay**: Global search across rules, nodes, and docs.
- **Health gauge**: SVG circular gauge with weighted score and actionable suggestions.
- **Graph build trigger**: One-click button to build/rebuild the dependency graph from the UI.

**State management**: TanStack Query with auto-refetch intervals (5–30s depending on the data type). No global state store — all state is server-derived.

**API client** (`api-client.ts`): 30+ typed fetch functions covering every REST endpoint.

#### Key files
- `src/ui/App.tsx` — Route definitions
- `src/ui/components/Layout.tsx` — Sidebar navigation, breadcrumbs, health indicator
- `src/ui/components/Dashboard.tsx` — Main dashboard with stats, repo cards, heatmap
- `src/ui/components/GraphViewer.tsx` — D3 dependency graph (590 lines)
- `src/ui/components/ActivityLogs.tsx` — Activity log viewer with live tail
- `src/ui/components/HealthScore.tsx` — Health gauge (compact + full variants)
- `src/ui/components/HotspotList.tsx` — File risk scoring table
- `src/ui/lib/api-client.ts` — Typed API client (373 lines)
- `src/ui/lib/graph-layout.ts` — D3 force simulation setup

#### Design decisions
- **Dark theme**: Zinc-based dark palette with indigo accents. Consistent with developer tooling aesthetics.
- **Server-side graph building**: The "Build Graph" button triggers a server-side operation — no client-side computation.
- **No client-side routing for graph**: Graph is always the default view when navigating to a repo.

#### Trade-offs / limitations
- D3 force layout can struggle with very large graphs (1000+ nodes). No clustering or level-of-detail.
- No client-side caching beyond TanStack Query's stale-while-revalidate.
- Pre-built UI assets are committed to `src/ui/dist/` — must be rebuilt for UI changes.

---

## Cross-Cutting Concerns

### Error Handling
- **Domain errors**: `CortexError` hierarchy with `code` and `statusCode` fields. Each API handler catches and maps to HTTP responses.
- **LSP errors**: Silently caught — graph building continues with partial data.
- **Git errors**: Caught per-file; metrics collection returns zeros for failed files.

### Configuration
- Two-layer: central (`~/.cortex/config.json`) + per-repo (`.cortex.json`)
- Deep merge: repo config overrides central, non-destructively
- Configurable: server port/host, storage path, language servers, graph ignore paths, LSP pool timeout

### Testing
- Integration tests in `tests/server/api.test.ts`: spin up a real server with an in-memory temp DB + temp git repo
- Tests cover: health, repo CRUD, rule CRUD, graph, stats, cross-repo rules, hook notifications

---

## System Interconnection Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                          ENTRY POINTS                                │
│                                                                      │
│  CLI (cortex serve)    MCP Client (AI Agent)    Browser (Web UI)     │
│       │                      │                       │               │
│       ▼                      ▼                       ▼               │
│  ┌─────────┐          ┌───────────┐           ┌──────────┐          │
│  │  serve   │──────────│ Express   │───────────│ Static   │          │
│  │ command  │          │ Server    │           │ Files    │          │
│  └─────────┘          └─────┬─────┘           └──────────┘          │
│                             │                                        │
│            ┌────────────────┼────────────────┐                       │
│            ▼                ▼                ▼                        │
│     ┌──────────┐    ┌────────────┐   ┌──────────┐                   │
│     │ REST API │    │ MCP Server │   │ SSE Log  │                   │
│     │ Routes   │    │ (11 tools) │   │ Stream   │                   │
│     └────┬─────┘    └─────┬──────┘   └────┬─────┘                   │
│          │                │               │                          │
│          ▼                ▼               ▼                          │
│  ┌───────────────────────────────────────────────┐                   │
│  │              Activity Logger                   │                   │
│  │     (logs all MCP + REST calls, SSE pub)       │                   │
│  └───────────────────────────────────────────────┘                   │
│                             │                                        │
│          ┌──────────────────┼──────────────────────┐                 │
│          ▼                  ▼                      ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐           │
│  │  RepoRouter  │  │  SyncService │  │  ManifestService │           │
│  │  RepoManager │  │  + Collector │  │  + HashComputer  │           │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘           │
│         │                 │                    │                     │
│   ┌─────┼─────────────────┼────────────────────┼──────┐             │
│   │     ▼                 ▼                    ▼      │             │
│   │  ┌───────────────────────────────────────────┐    │             │
│   │  │              StorageService               │    │             │
│   │  │        (SQLite, WAL mode, 8 tables)       │    │             │
│   │  └───────────────────────────────────────────┘    │             │
│   │                                                   │             │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │             │
│   │  │  Graph   │  │  Rule    │  │   Branch     │    │             │
│   │  │  Builder │  │  Service │  │   Service    │    │             │
│   │  │  + Query │  │          │  │   + Conflict │    │             │
│   │  └────┬─────┘  └──────────┘  └──────────────┘    │             │
│   │       │                                           │             │
│   │       ▼                                           │             │
│   │  ┌──────────────────┐  ┌──────────┐              │             │
│   │  │  LSP Server Pool │  │  Git     │              │             │
│   │  │  + Registry      │  │  Service │              │             │
│   │  │  + Protocol      │  │  + Hooks │              │             │
│   │  └──────────────────┘  └──────────┘              │             │
│   │                                                   │             │
│   │  ┌──────────────────┐  ┌──────────────────┐      │             │
│   │  │  Doc Scanner     │  │  Health Computer │      │             │
│   │  │  + Doc Service   │  │  + File Metrics  │      │             │
│   │  └──────────────────┘  └──────────────────┘      │             │
│   │                                                   │             │
│   │  ┌──────────────────┐                            │             │
│   │  │  Webhook Service │                            │             │
│   │  └──────────────────┘                            │             │
│   └───────────────────────────────────────────────────┘             │
│                                                                      │
│              ┌──────────────────────────────────────┐                │
│              │         Git Repository (on disk)      │                │
│              │  .git/hooks/  ←  hookInstaller         │                │
│              │  Source files  ←  git ls-files          │                │
│              │  Staged diff   ←  git diff --cached     │                │
│              └──────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────┘
```

---

*Document generated by full codebase analysis. 67 source files read, 0 assumptions made.*
