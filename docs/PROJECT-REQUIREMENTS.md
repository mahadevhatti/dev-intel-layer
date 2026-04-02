# Cortex

## Project Requirements Specification — Final

| Field            | Value                                       |
| ---------------- | ------------------------------------------- |
| Project          | Cortex                                      |
| Type             | Local-first central MCP intelligence server    |
| Author           | Mahadev Hatti                               |
| Created          | 2026-04-02                                  |
| Status           | Planning → Phase 1                          |
| Runtime          | Node.js 20+                                 |
| Language          | TypeScript 5.x (strict mode)               |
| License          | MIT                                         |

---

## 1. Problem Statement

AI coding agents (Cursor, Claude Code, Copilot) generate code without awareness of project architecture, conventions, past decisions, or dependency structure. This leads to:

- Architectural drift (agents suggest patterns that contradict project norms)
- Repeated mistakes (lessons learned in past PRs are forgotten)
- Broken dependencies (agents modify files without understanding the impact graph)
- No enforcement (nothing prevents a commit that silently breaks conventions)

There is no system that maintains a **persistent, structured knowledge base** of a codebase and makes it available to **any** AI agent in a deterministic, verifiable way.

---

## 2. Solution

A local-first intelligence system that:

1. **Captures** developer intent as structured knowledge (rules, lessons, preferences)
2. **Maps** codebase structure as a semantic dependency graph (via LSP)
3. **Syncs** knowledge with code changes (Git-driven)
4. **Enforces** synchronization deterministically (pre-commit hook + manifest)
5. **Exposes** everything to AI agents via MCP over HTTP (agent-agnostic, multi-repo)

### Core Design Principle

> **AI suggests. Git validates. Manifest enforces. Human approves.**

- The MCP server is a **pure data + enforcement layer**
- AI intelligence comes from the IDE agent (Cursor / Claude Code), not from the server
- All knowledge updates require explicit human approval
- Enforcement is deterministic and independent of any AI

---

## 3. Objectives

| # | Objective                                                        | Measurable Outcome                              |
|---|------------------------------------------------------------------|--------------------------------------------------|
| 1 | Maintain a persistent, structured knowledge base                 | KB persists across sessions, versioned in central SQLite |
| 2 | Represent code structure + semantic meaning                      | Dependency graph with node enrichment             |
| 3 | Ensure branch-aware evolution                                    | Independent KB per branch with inheritance        |
| 4 | Enforce KB–code synchronization before commits                   | Pre-commit hook blocks on manifest mismatch       |
| 5 | Enable agent-agnostic usage via MCP                              | Any MCP client can connect over HTTP and read/write knowledge |
| 6 | Keep system local-first and transparent                          | Zero cloud dependencies, human-readable storage   |
| 7 | Support any programming language without code changes             | LSP-based architecture, config-driven languages   |
| 8 | Manage multiple repos from a single server                       | One server process, multiple agents, repo-partitioned data |

---

## 4. Non-Goals

- **Not** an AI model or LLM — it is a context engine for AI agents
- **Not** a Git replacement — it complements Git
- **Not** cloud-dependent — fully local, localhost-only HTTP server
- **Not** tied to one IDE — agent-agnostic via MCP over HTTP
- **Not** per-repo — one central server manages all repos
- **Not** a linter or formatter — it captures intent, not style

---

## 5. System Architecture

### 5.1 Architecture Overview

Cortex runs as a **single persistent HTTP server** on the developer's machine. Multiple AI agents (across different IDEs and projects) connect to it as clients. The server manages all registered repos through one central SQLite database.

```
┌──────────────────────────────────────────────────────────────────────┐
│                      AI Agents (Multiple Clients)                     │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Cursor (Proj A)  │  │ Cursor (Proj B)  │  │ Claude Code (C)   │  │
│  │  MCP Client      │  │  MCP Client      │  │  MCP Client       │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬──────────┘  │
└───────────┼──────────────────────┼──────────────────────┼────────────┘
            │                      │                      │
            │    MCP over Streamable HTTP (localhost:4170/mcp)
            │    Each request includes repoPath            │
            ▼                      ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Cortex Central Server (localhost:4170)               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  HTTP Layer                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │  │
│  │  │ MCP Endpoint │  │  REST API    │  │  React UI (static)  │  │  │
│  │  │  /mcp        │  │  /api/*      │  │  /                  │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └─────────────────────┘  │  │
│  └─────────┼─────────────────┼───────────────────────────────────┘  │
│            └────────┬────────┘                                      │
│                     ▼                                               │
│  ┌──────────────────────────────────────────┐                       │
│  │           Repo Router                     │                       │
│  │  Routes requests to correct repo context  │                       │
│  └──────────────────┬───────────────────────┘                       │
│                     │                                               │
│  ┌──────────┬───────┼──────────┬────────────┐                       │
│  ▼          ▼       ▼          ▼            ▼                       │
│ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│ │ Repo   │ │Knowledge │ │ Semantic │ │   Git    │ │  Manifest   │  │
│ │Manager │ │  Store   │ │  Graph   │ │ Service  │ │  Engine     │  │
│ │        │ │(Central  │ │  (LSP)   │ │(per-repo)│ │ (SHA-256)   │  │
│ │        │ │ SQLite)  │ │          │ │          │ │             │  │
│ └────────┘ └──────────┘ └────┬─────┘ └──────────┘ └─────────────┘  │
│                              │                                      │
│            ┌─────────────────┤  LSP Server Pool                     │
│            │                 │  (keyed by repoId + language)        │
│            ▼                 ▼                                      │
│     ┌──────────┐      ┌──────────┐      ┌──────────────┐           │
│     │ tsserver │      │ tsserver │      │rust-analyzer │           │
│     │(Proj A)  │      │(Proj B)  │      │  (Proj C)    │           │
│     └──────────┘      └──────────┘      └──────────────┘           │
│                                                                      │
│  Storage: ~/.cortex/knowledge.db (single central DB)                 │
└──────────────────────────────────────────────────────────────────────┘

        ┌──────────────────┐
        │  Browser          │
        │  localhost:4170   │──→ React UI + REST API
        └──────────────────┘
```

### 5.2 Component Summary

| Component                 | Purpose                                    | Technology               |
|---------------------------|--------------------------------------------|--------------------------|
| Knowledge Store           | Persist rules, lessons, preferences        | better-sqlite3 (central DB) |
| Repo Manager              | Track repos, auto-bootstrap on first use   | SQLite registry          |
| Semantic Graph            | Map code structure + dependencies          | LSP Client + SQLite      |
| Git Integration           | Detect changes, track commits (per-repo)   | simple-git               |
| Manifest Engine           | Deterministic sync verification            | SHA-256 hashing          |
| MCP Server                | Agent-agnostic API (multi-client)          | @modelcontextprotocol/sdk (Streamable HTTP) |
| HTTP Server               | REST API + static UI serving               | Express                  |
| Pre-commit Hook           | Block commits on KB drift                  | Shell script + curl      |
| Language Server Pool      | Spawn/manage LSP servers per-repo          | vscode-jsonrpc           |
| Web UI (auto-served)      | Visualization + control (multi-repo)       | Vite + React + D3.js     |

---

## 6. Detailed Component Specifications

### 6.1 Declarative Knowledge Layer (Memory)

**Purpose**: Capture developer intent as explicit, versioned, human-editable knowledge.

#### Knowledge Types

| Type        | Description                                 | Example                                   |
|-------------|---------------------------------------------|-------------------------------------------|
| Constraint  | Hard rules that must be followed            | "Use apiClient for all HTTP requests"     |
| Lesson      | Past issues to avoid                        | "Avoid lodash v4.17.20 — prototype pollution" |
| Preference  | Style/architectural choices                 | "Prefer composition over inheritance"     |

#### Knowledge Properties

- **Explicit**: Human-written or human-approved (never auto-applied)
- **Versioned**: Auto-incrementing version on every mutation
- **Scoped**: Cross-repo (all repos), repo-global (all branches in a repo), or branch-specific
- **Repo-aware**: Every rule belongs to a repo, or is cross-repo
- **Auditable**: Created/updated timestamps, full history

#### Data Model

```typescript
interface KnowledgeRule {
  id: string;                          // UUID
  repoId: string | null;              // null = cross-repo rule (applies to all repos)
  type: 'constraint' | 'lesson' | 'preference';
  content: string;                     // Human-readable rule text
  scope: 'cross-repo' | 'global' | `branch:${string}`;
  version: number;                     // Auto-incremented
  tags: string[];                      // Optional categorization
  source: 'manual' | 'ai-suggested';  // How it was created
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
  active: boolean;                     // Soft delete
}
```

**Scope semantics**:
- `cross-repo`: Rule applies to all repos managed by the server (e.g., "always use conventional commits"). `repoId` is null.
- `global`: Rule applies to all branches within a specific repo. `repoId` is set.
- `branch:<name>`: Rule applies to a specific branch within a specific repo. `repoId` is set.

#### SQLite Schema

All tables live in a single central database at `~/.cortex/knowledge.db`.

```sql
-- Central repo registry
CREATE TABLE repos (
  id               TEXT PRIMARY KEY,     -- SHA-256 of absolute path
  name             TEXT NOT NULL,        -- Human-friendly name (dirname)
  path             TEXT NOT NULL UNIQUE, -- Absolute path to repo root
  status           TEXT NOT NULL DEFAULT 'initialized'
                     CHECK(status IN ('initialized', 'scanning', 'ready', 'error')),
  languages        TEXT DEFAULT '[]',    -- JSON array of detected languages
  created_at       TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL
);

CREATE TABLE rules (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT REFERENCES repos(id), -- null = cross-repo rule
  type        TEXT NOT NULL CHECK(type IN ('constraint', 'lesson', 'preference')),
  content     TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'global',
  version     INTEGER NOT NULL DEFAULT 1,
  tags        TEXT DEFAULT '[]',       -- JSON array
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_rules_repo ON rules(repo_id);
CREATE INDEX idx_rules_scope ON rules(scope);
CREATE INDEX idx_rules_type ON rules(type);
CREATE INDEX idx_rules_active ON rules(active);
```

---

### 6.2 Structural Knowledge Layer (Semantic Graph via LSP)

**Purpose**: Represent codebase structure and dependencies using Language Server Protocol.

#### Why LSP (Not Raw AST)

The M x N problem: M editors × N languages = M×N integrations.
The M + N solution: LSP standardizes the protocol. Cortex is an LSP client.

- Cortex's graph engine is **language-agnostic** — it speaks LSP, not TypeScript/Python/Rust
- Adding a new language = adding a config entry, not writing a parser
- Language servers (tsserver, pyright, rust-analyzer) are battle-tested and maintained by language creators

#### Language Server Registry

```typescript
interface LanguageServerConfig {
  id: string;
  name: string;
  extensions: string[];
  command: string;
  args: string[];
  installHint: string;           // How to install if missing
  initializationOptions?: Record<string, unknown>;
}
```

**Built-in registry**:

| Language       | Server                      | Command                          | Install                         |
|----------------|-----------------------------|----------------------------------|---------------------------------|
| TypeScript/JS  | typescript-language-server   | `typescript-language-server --stdio` | `npm i -g typescript-language-server typescript` |
| Python         | pyright                     | `pyright-langserver --stdio`     | `pip install pyright`           |
| Rust           | rust-analyzer               | `rust-analyzer`                  | `rustup component add rust-analyzer` |
| Go             | gopls                       | `gopls serve`                    | `go install golang.org/x/tools/gopls@latest` |
| Java           | jdtls                       | `jdtls`                          | Download from Eclipse           |

Users can add custom servers via `~/.cortex/config.json` or per-repo `.cortex.json`.

#### LSP Methods Used

| LSP Method                           | What Cortex Extracts          | Graph Mapping          |
|--------------------------------------|-------------------------------|------------------------|
| `textDocument/documentSymbol`        | Functions, classes, interfaces | `GraphNode.symbols[]`  |
| `textDocument/definition`            | Import resolution             | `GraphEdge` (dependency) |
| `textDocument/references`            | Who uses this symbol          | `GraphEdge` (dependent) |
| `callHierarchy/outgoingCalls`        | What this function calls      | `GraphEdge` (call)     |
| `callHierarchy/incomingCalls`        | Who calls this function       | `GraphEdge` (caller)   |
| `workspace/symbol`                   | Cross-file symbol search      | Discovery              |

#### Graph Data Model

```typescript
interface GraphNode {
  id: string;                          // Composite: repoId + ':' + filePath
  repoId: string;                     // Which repo this node belongs to
  filePath: string;                   // File path (relative to repo root)
  language: string;                    // Detected from extension
  symbols: SymbolInfo[];               // Functions, classes, exports
  summary: string;                     // AI-generated (via MCP, not server)
  responsibilities: string[];          // AI-generated
  lastAnalyzed: string;                // ISO timestamp
  commitHash: string;                  // Commit when last analyzed
}

interface SymbolInfo {
  name: string;
  kind: SymbolKind;                    // function, class, interface, variable, etc.
  range: { startLine: number; endLine: number };
  exported: boolean;
}

interface GraphEdge {
  id: string;
  repoId: string;                     // Which repo this edge belongs to
  source: string;                      // Source node ID
  target: string;                      // Target node ID
  relationship: EdgeRelationship;
  symbols: string[];                   // Which symbols create this edge
}

type EdgeRelationship =
  | 'imports'          // source imports from target
  | 'imported_by'      // source is imported by target
  | 'calls'            // source calls function in target
  | 'called_by'        // source has function called by target
  | 'extends'          // source extends class in target
  | 'implements';      // source implements interface in target

type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'variable'
  | 'enum'
  | 'type'
  | 'module'
  | 'method'
  | 'property';
```

#### SQLite Schema

```sql
CREATE TABLE graph_nodes (
  id               TEXT PRIMARY KEY,     -- composite: repo_id + ':' + file_path
  repo_id          TEXT NOT NULL REFERENCES repos(id),
  file_path        TEXT NOT NULL,        -- relative file path within repo
  language         TEXT NOT NULL,
  symbols          TEXT NOT NULL,        -- JSON array of SymbolInfo
  summary          TEXT DEFAULT '',
  responsibilities TEXT DEFAULT '[]',    -- JSON array
  last_analyzed    TEXT NOT NULL,
  commit_hash      TEXT NOT NULL,
  UNIQUE(repo_id, file_path)
);

CREATE INDEX idx_nodes_repo ON graph_nodes(repo_id);

CREATE TABLE graph_edges (
  id             TEXT PRIMARY KEY,
  repo_id        TEXT NOT NULL REFERENCES repos(id),
  source         TEXT NOT NULL REFERENCES graph_nodes(id),
  target         TEXT NOT NULL REFERENCES graph_nodes(id),
  relationship   TEXT NOT NULL,
  symbols        TEXT DEFAULT '[]',    -- JSON array
  UNIQUE(repo_id, source, target, relationship)
);

CREATE INDEX idx_edges_repo ON graph_edges(repo_id);
CREATE INDEX idx_edges_source ON graph_edges(source);
CREATE INDEX idx_edges_target ON graph_edges(target);
```

#### LSP Server Pool

The server maintains a pool of LSP server instances keyed by `(repoId, language)`. This allows multiple repos to have their own language server instances without interference. Idle servers are shut down after a configurable timeout to conserve resources.

```typescript
class LSPServerPool {
  /**
   * Pool lifecycle:
   * 1. detectLanguages(repoPath) → which servers are needed for this repo
   * 2. checkAvailability(serverId) → is binary in PATH?
   * 3. getOrSpawn(repoId, serverId) → reuse existing or start new child process
   * 4. initialize(repoId, serverId, rootUri) → LSP handshake
   * 5. query(repoId, serverId, method, params) → send LSP request, get response
   * 6. shutdown(repoId, serverId) → graceful shutdown of one server
   * 7. shutdownRepo(repoId) → shutdown all servers for a repo
   * 8. shutdownAll() → cleanup on exit
   *
   * Idle timeout: servers not queried for `lspPool.idleTimeoutMs` are shut down.
   */

  detectLanguages(repoPath: string): string[];
  checkAvailability(serverId: string): { available: boolean; installHint?: string };
  getOrSpawn(repoId: string, serverId: string): Promise<void>;
  initialize(repoId: string, serverId: string, rootUri: string): Promise<ServerCapabilities>;
  query<T>(repoId: string, serverId: string, method: string, params: unknown): Promise<T>;
  shutdown(repoId: string, serverId: string): Promise<void>;
  shutdownRepo(repoId: string): Promise<void>;
  shutdownAll(): Promise<void>;
}
```

#### GraphBuilder (Language-Agnostic, Repo-Scoped)

```typescript
class GraphBuilder {
  /**
   * This class NEVER parses code. It only speaks LSP.
   * All operations are scoped to a specific repo.
   *
   * 1. buildFullGraph(repoId, rootPath) → scan all files, query LSP, build nodes + edges
   * 2. rebuildIncremental(repoId, changedFiles) → re-query only affected files
   * 3. getNode(repoId, filePath) → single node
   * 4. getDependenciesOf(repoId, filePath) → outgoing edges
   * 5. getDependentsOf(repoId, filePath) → incoming edges
   * 6. getAffectedByChange(repoId, filePaths) → transitive closure of dependents
   */

  constructor(
    private lspPool: LSPServerPool,
    private storage: StorageService
  ) {}

  async buildFullGraph(repoId: string, rootPath: string): Promise<BuildResult>;
  async rebuildIncremental(repoId: string, changedFiles: string[]): Promise<BuildResult>;
  getNode(repoId: string, filePath: string): GraphNode | null;
  getDependenciesOf(repoId: string, filePath: string): GraphEdge[];
  getDependentsOf(repoId: string, filePath: string): GraphEdge[];
  getAffectedByChange(repoId: string, filePaths: string[]): string[];
}
```

---

### 6.3 Knowledge Manifest (Deterministic Anchor)

**Purpose**: Provide a verifiable sync state between KB and Git, per-repo.

#### Manifest Data Model

Manifests are stored in the central database, not as files in each repo. Each repo has exactly one manifest record representing its current sync state.

```typescript
interface KBManifest {
  repoId: string;                     // Which repo this manifest belongs to
  version: number;                     // Manifest schema version
  baseCommit: string;                  // Git commit hash when KB was last synced
  stagedHash: string;                  // SHA-256 of staged files + diff
  indexedFiles: string[];              // All files currently in the graph
  indexedFileCount: number;            // Quick count
  rulesVersion: number;               // Sum of all rule versions (quick drift check)
  rulesCount: number;                  // Total active rules
  graphNodeCount: number;              // Total graph nodes
  graphEdgeCount: number;              // Total graph edges
  lastSyncedAt: string;               // ISO timestamp
  lastSyncedBy: string;               // 'manual' | agent identifier
  branchName: string;                  // Current branch
}
```

#### SQLite Schema

```sql
CREATE TABLE manifests (
  repo_id       TEXT PRIMARY KEY REFERENCES repos(id),
  version       INTEGER NOT NULL DEFAULT 1,
  base_commit   TEXT NOT NULL,
  staged_hash   TEXT NOT NULL,
  indexed_files TEXT NOT NULL DEFAULT '[]',  -- JSON array
  data          TEXT NOT NULL,                -- Full manifest JSON (all fields)
  updated_at    TEXT NOT NULL
);
```

#### Hash Computation

```typescript
function computeStagedHash(stagedFiles: string[], diffContent: string): string {
  const sorted = [...stagedFiles].sort();
  const payload = sorted.join('\n') + '\n---\n' + diffContent;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

The hash is **deterministic**: same staged content always produces the same hash, regardless of when or where it's computed.

#### Storage Location

All Cortex data is stored centrally:

```
~/.cortex/
  knowledge.db              # Central SQLite database (repos, rules, graph, manifests)
  config.json               # Central server configuration
```

Individual repos may optionally have a `.cortex.json` file at the repo root for per-repo configuration overrides (language server settings, ignore paths, etc.). This is the only Cortex artifact in a repo's working tree.

---

### 6.4 Git Synchronization Layer

**Purpose**: Detect code changes reliably using Git.

#### Git Service Interface

The `GitService` is instantiated per-repo by the Repo Router. It wraps `simple-git` scoped to a specific repo path.

```typescript
class GitService {
  constructor(private repoPath: string) {}

  getStagedFiles(): Promise<string[]>;
  getStagedDiff(): Promise<string>;
  getCurrentCommit(): Promise<string>;
  getBranchName(): Promise<string>;
  getChangedFilesSince(commitHash: string): Promise<string[]>;
  isInsideWorkTree(): Promise<boolean>;
  getRepoRoot(): Promise<string>;
}
```

#### Git Hooks

| Hook           | Trigger               | Cortex Action                       |
|----------------|-----------------------|-------------------------------------|
| `pre-commit`   | Before every commit   | Call Cortex server to validate manifest ↔ staged hash |
| `post-merge`   | After `git merge`     | Notify Cortex server: flag KB resync needed |
| `post-checkout`| After branch switch   | Notify Cortex server: switch branch KB context |

#### Pre-commit Hook (Shell Script)

The hook is lightweight — it makes an HTTP call to the running Cortex central server instead of reading a local manifest file. No `.cortex/` directory is needed in the repo.

```bash
#!/bin/sh
# .git/hooks/pre-commit — installed by `npx cortex install-hooks /path/to/repo`

CORTEX_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)

# Check if Cortex server is running
if ! curl -s --max-time 2 "$CORTEX_SERVER/api/health" > /dev/null 2>&1; then
  echo "⚠ Cortex: Server not running. Skipping KB sync check."
  echo "   Start it with: npx cortex serve"
  exit 0  # Don't block if server is down
fi

# Compute current staged hash
STAGED_FILES=$(git diff --cached --name-only | sort)
DIFF_CONTENT=$(git diff --cached)
CURRENT_HASH=$(echo "${STAGED_FILES}---${DIFF_CONTENT}" | shasum -a 256 | cut -d' ' -f1)

# Get manifest hash from central server
MANIFEST_HASH=$(curl -s "$CORTEX_SERVER/api/repos/manifest?repoPath=$REPO_ROOT" \
  | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).stagedHash)}catch{console.log('UNKNOWN')}})")

if [ "$MANIFEST_HASH" = "UNKNOWN" ]; then
  echo "⚠ Cortex: Repo not registered with Cortex server. Skipping check."
  exit 0
fi

if [ "$CURRENT_HASH" != "$MANIFEST_HASH" ]; then
  echo ""
  echo "❌ Cortex: Knowledge base is out of sync with staged changes."
  echo ""
  echo "   Staged hash:   $CURRENT_HASH"
  echo "   Manifest hash:  $MANIFEST_HASH"
  echo ""
  echo "   → Open your AI agent and run:"
  echo "     \"Sync knowledge base for current changes\""
  echo ""
  exit 1
fi

exit 0
```

#### Post-merge Hook

```bash
#!/bin/sh
CORTEX_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)
curl -s -X POST "$CORTEX_SERVER/api/repos/notify" \
  -H "Content-Type: application/json" \
  -d "{\"repoPath\":\"$REPO_ROOT\",\"event\":\"post-merge\"}" > /dev/null 2>&1
```

#### Post-checkout Hook

```bash
#!/bin/sh
CORTEX_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)
NEW_BRANCH=$(git rev-parse --abbrev-ref HEAD)
curl -s -X POST "$CORTEX_SERVER/api/repos/notify" \
  -H "Content-Type: application/json" \
  -d "{\"repoPath\":\"$REPO_ROOT\",\"event\":\"post-checkout\",\"branch\":\"$NEW_BRANCH\"}" > /dev/null 2>&1
```

---

### 6.5 MCP Integration Layer (Agent-Agnostic API)

**Purpose**: Allow any MCP-compatible AI agent to interact with the knowledge system. Multiple agents connect concurrently to one central server.

#### Transport: Streamable HTTP

Cortex uses **Streamable HTTP** (not stdio) as its MCP transport. The server runs as a persistent process on the developer's machine, and AI agents connect to it over HTTP. This enables:

- Multiple agents connecting simultaneously (different IDEs, different projects)
- No IDE-spawned processes — the user starts the server once
- The same HTTP server hosts MCP, REST API, and the React UI

#### MCP Client Configuration

This is what goes into IDE settings (Cursor `mcp.json`, Claude Code config, etc.):

```json
{
  "mcpServers": {
    "cortex": {
      "url": "http://localhost:4170/mcp"
    }
  }
}
```

No `command`, no `args`, no `env` — the server is already running. The agent just connects to the URL.

#### Repo Identification

**Every repo-scoped MCP tool requires a `repoPath` parameter.** This is how the agent tells the server which repo it's operating on. The agent knows its own project root and passes it automatically.

```typescript
// Example: agent calls sync_kb for a specific repo
sync_kb({ repoPath: "/Users/me/projects/my-app", files: ["src/auth.ts"] })
```

If the `repoPath` has not been seen before, the server auto-bootstraps it (see Section 6.8).

#### Auto-Bootstrap Flow

1. Agent calls any repo-scoped tool with a `repoPath`
2. Server checks if `repoPath` is a registered repo in the `repos` table
3. If **not registered**: validates it's a git repo, creates DB entry with `status: 'scanning'`, kicks off background bootstrap
4. Returns `{ status: 'initializing', repoId, message: 'Repo is being bootstrapped. Call get_repo_status to check progress.' }`
5. On subsequent calls, if `status` is `'ready'`, the tool executes normally
6. If still `'scanning'`, returns progress info instead of blocking

#### MCP Tools

All repo-scoped tools accept `repoPath: string` as a required first parameter. It is omitted from the tables below for brevity but is always present.

##### `list_repos` — List Registered Repos

| Field   | Value |
|---------|-------|
| Purpose | Returns all repos the server knows about, with status |
| Input   | (none) |
| Output  | `{ repos: RepoInfo[] }` |

```typescript
interface RepoInfo {
  id: string;
  name: string;
  path: string;
  status: 'initialized' | 'scanning' | 'ready' | 'error';
  languages: string[];
  lastAccessedAt: string;
}
```

##### `get_repo_status` — Repo Detail

| Field   | Value |
|---------|-------|
| Purpose | Detailed status of a specific repo (useful during bootstrap) |
| Input   | `{ repoPath }` |
| Output  | `{ repo: RepoInfo, manifest?: KBManifest, stats?: { nodeCount, edgeCount, ruleCount } }` |

##### `sync_kb` — Collect Sync Data

| Field   | Value |
|---------|-------|
| Purpose | Collects all data the AI agent needs to propose KB updates |
| Input   | `{ repoPath, files?: string[], includeFullDiff?: boolean }` |
| Output  | `{ stagedFiles, diff, affectedNodes, existingRules, currentManifest, suggestedActions }` |

The AI agent calls this, analyzes the response, proposes updates, presents to user.

- **No `files`**: returns sync data for all staged files (full sync)
- **With `files`**: scopes the response to only the specified files — filtered diff, only affected nodes reachable from those files, and only rules relevant to them

```typescript
interface SyncKBInput {
  repoPath: string;
  files?: string[];                    // Scope to specific files (omit for all staged)
  includeFullDiff?: boolean;
}

interface SyncKBOutput {
  stagedFiles: string[];               // Filtered to requested files if provided
  diff: string;
  affectedNodes: GraphNode[];
  existingRules: KnowledgeRule[];
  currentManifest: KBManifest;
  suggestedActions: string[];          // Hints like "authService.ts has new exports"
}
```

##### `apply_kb_updates` — Apply Approved Changes

| Field   | Value |
|---------|-------|
| Purpose | Persists human-approved KB updates and refreshes manifest |
| Input   | `{ repoPath, nodeUpdates, ruleChanges }` |
| Output  | `{ success, updatedManifest, changesSummary }` |

```typescript
interface ApplyKBUpdatesInput {
  repoPath: string;
  nodeUpdates: {
    filePath: string;
    summary?: string;
    responsibilities?: string[];
  }[];
  ruleChanges: {
    action: 'add' | 'update' | 'deactivate';
    rule: Partial<KnowledgeRule>;
  }[];
}
```

##### `get_context` — Get Structured Context

| Field   | Value |
|---------|-------|
| Purpose | Returns relevant KB context for the AI agent to use during coding |
| Input   | `{ repoPath, files?: string[], query?: string, depth?: number }` |
| Output  | `{ nodes, edges, rules, relatedFiles }` |

When a developer is editing `authService.ts`, the agent calls `get_context({ repoPath: "...", files: ['authService.ts'] })` and receives:
- The node for `authService.ts` (summary, symbols, responsibilities)
- All edges (what it imports, what imports it)
- Relevant rules (scoped rules, repo-global constraints, plus cross-repo rules)
- Related files (2-hop dependency radius)

##### `get_rules` — List Rules

| Field   | Value |
|---------|-------|
| Purpose | List all knowledge rules, optionally filtered |
| Input   | `{ repoPath, scope?: string, type?: string, active?: boolean, includeCrossRepo?: boolean }` |
| Output  | `{ rules: KnowledgeRule[] }` |

When `includeCrossRepo` is true (default), cross-repo rules are included alongside repo-specific rules.

##### `add_rule` — Add a Rule

| Field   | Value |
|---------|-------|
| Purpose | Add a new knowledge rule |
| Input   | `{ repoPath?, type, content, scope?, tags? }` |
| Output  | `{ rule: KnowledgeRule }` |

If `repoPath` is omitted and `scope` is `'cross-repo'`, the rule applies to all repos.

##### `update_rule` — Modify a Rule

| Field   | Value |
|---------|-------|
| Purpose | Update an existing rule (auto-increments version) |
| Input   | `{ id, content?, scope?, tags?, active? }` |
| Output  | `{ rule: KnowledgeRule }` |

##### `get_graph` — Query Graph

| Field   | Value |
|---------|-------|
| Purpose | Get dependency graph or subgraph |
| Input   | `{ repoPath, file?: string, depth?: number, includeSymbols?: boolean }` |
| Output  | `{ nodes: GraphNode[], edges: GraphEdge[] }` |

##### `get_manifest` — Current Manifest

| Field   | Value |
|---------|-------|
| Purpose | Read the current manifest state for a repo |
| Input   | `{ repoPath }` |
| Output  | `{ manifest: KBManifest }` |

##### `init_kb` — Bootstrap Initialization

| Field   | Value |
|---------|-------|
| Purpose | Explicitly initialize a repo's knowledge base (alternative to auto-bootstrap) |
| Input   | `{ repoPath, mode: 'current-branch' \| 'main' \| 'full' \| 'empty' }` |
| Output  | `{ status, repoId, filesIndexed, nodesCreated, edgesCreated, manifest }` |

##### `get_conflicts` — Branch Merge Conflicts

| Field   | Value |
|---------|-------|
| Purpose | Surface KB conflicts after merge |
| Input   | `{ repoPath }` |
| Output  | `{ conflicts: KBConflict[] }` |

```typescript
interface KBConflict {
  type: 'rule' | 'node';
  id: string;
  repoId: string;
  local: KnowledgeRule | GraphNode;
  incoming: KnowledgeRule | GraphNode;
  suggestedResolution: 'keep-local' | 'accept-incoming' | 'manual';
}
```

##### `resolve_conflict` — Resolve a KB Conflict

| Field   | Value |
|---------|-------|
| Purpose | Resolve a specific KB conflict |
| Input   | `{ repoPath, conflictId, resolution: 'keep-local' \| 'accept-incoming' \| 'custom', customValue? }` |
| Output  | `{ resolved: boolean }` |

#### MCP Resources (Read-Only)

Resources are parameterized by repo ID. The agent discovers repos via `list_repos`, then accesses repo-specific resources.

| URI                            | Description              | MIME Type          |
|--------------------------------|--------------------------|--------------------|
| `kb://repos`                   | All registered repos     | `application/json` |
| `kb://repos/{repoId}/manifest` | Manifest for a repo      | `application/json` |
| `kb://repos/{repoId}/rules`    | Active rules for a repo  | `application/json` |
| `kb://repos/{repoId}/graph`    | Full graph for a repo    | `application/json` |
| `kb://repos/{repoId}/stats`    | KB statistics for a repo | `application/json` |
| `kb://rules/cross-repo`        | Cross-repo rules         | `application/json` |

---

### 6.6 Knowledge Synchronization Workflow

**Purpose**: The full flow from code change to updated KB.

#### Trigger

Developer has staged changes and opens an AI agent chat.

#### Flow

```
┌────────────────────────────────────────────────────────┐
│  Step 1: Agent calls sync_kb                           │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Cortex collects:                                     │ │
│  │  • Staged files (git diff --cached --name-only)   │ │
│  │  • Full diff (git diff --cached)                  │ │
│  │  • Affected graph nodes                           │ │
│  │  • Current rules                                  │ │
│  │  • Current manifest                               │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↓                             │
│  Step 2: Agent analyzes data                           │
│  ┌───────────────────────────────────────────────────┐ │
│  │ AI agent (Cursor/Claude Code):                    │ │
│  │  • Reads diff, understands changes                │ │
│  │  • Proposes updated summaries for changed files   │ │
│  │  • Suggests new rules from conversation context   │ │
│  │  • Identifies new/removed dependencies            │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↓                             │
│  Step 3: Agent presents to user for approval           │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Detected Changes:                                │ │
│  │                                                   │ │
│  │  [CODE]                                           │ │
│  │   • authService.ts — updated summary              │ │
│  │   • userController.ts — new dependency on logger  │ │
│  │                                                   │ │
│  │  [RULES]                                          │ │
│  │   • New constraint: "Use apiClient for HTTP"      │ │
│  │                                                   │ │
│  │  Approve? [Yes / Edit / Skip]                     │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↓                             │
│  Step 4: Agent calls apply_kb_updates                  │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Cortex applies:                                      │ │
│  │  • Updates graph nodes in SQLite                  │ │
│  │  • Adds/updates rules in SQLite                   │ │
│  │  • Recomputes manifest hash                       │ │
│  │  • Updates manifest record in central DB          │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↓                             │
│  Step 5: Commit succeeds                               │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Pre-commit hook:                                 │ │
│  │   staged hash == manifest hash ✅                 │ │
│  │   → commit allowed                               │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

### 6.7 Branch-Aware Knowledge Model

**Purpose**: Each branch has its own KB view that inherits from its parent. All branch data is stored in the central database, not as files in individual repos.

#### Storage Model

Branch snapshots and deltas are stored in the central SQLite database, keyed by `(repo_id, branch_name)`:

```sql
CREATE TABLE branch_snapshots (
  id            TEXT PRIMARY KEY,
  repo_id       TEXT NOT NULL REFERENCES repos(id),
  branch_name   TEXT NOT NULL,
  parent_branch TEXT,
  base_commit   TEXT NOT NULL,
  snapshot_data TEXT NOT NULL,          -- JSON: serialized rules + node summaries at branch point
  created_at    TEXT NOT NULL,
  UNIQUE(repo_id, branch_name)
);
```

#### Branch Metadata

```typescript
interface BranchKB {
  repoId: string;                     // Which repo this branch belongs to
  branchName: string;
  parentBranch: string;             // Which branch this was created from
  baseCommit: string;               // Commit where branch diverged
  deltaRules: KnowledgeRule[];      // Rules added/changed on this branch
  deltaNodes: GraphNode[];          // Nodes modified on this branch
  createdAt: string;
}
```

#### Branch Operations

| Operation       | What Happens                                          |
|-----------------|-------------------------------------------------------|
| Branch switch   | Post-checkout hook notifies Cortex server via HTTP; server saves current delta, loads target |
| New branch      | Inherits parent KB as base snapshot                   |
| Merge to main   | Delta applied to main; conflicts surfaced via MCP     |
| Branch delete   | Delta removed (parent unaffected)                     |

#### Computed View

The "current KB" for a branch is always:

```
Computed View = Parent Snapshot + Branch Delta
```

This means branches are lightweight (only storing changes), and parent updates can be selectively pulled in.

---

### 6.8 Bootstrap Initialization

**Purpose**: First-time setup when a repo is introduced to the Cortex server. Repos are auto-discovered — no manual init step required.

#### Trigger

The primary trigger is **auto-discovery**: when an AI agent calls any MCP tool with a `repoPath` the server hasn't seen before, the server bootstraps it automatically.

Alternative triggers:
- Agent explicitly calls `init_kb({ repoPath, mode })` for more control
- User manually registers via CLI: `npx cortex repos add /path/to/repo`

There is no requirement for a `.cortex/` directory to exist in the repo. All state is centralized.

#### Modes

| Mode             | Scans                     | Use Case                    |
|------------------|---------------------------|-----------------------------|
| `current-branch` | Only files on current branch | Feature branch setup       |
| `main`           | Main/master branch        | Standard setup              |
| `full`           | Entire repo history       | Deep initialization         |
| `empty`          | Nothing                   | Start from scratch          |

Auto-bootstrap uses `current-branch` by default. The agent can call `init_kb` with a specific mode if needed.

#### Init Process

1. Validate `repoPath` is a git repository
2. Compute repo ID (SHA-256 of absolute path)
3. Insert record into `repos` table with `status: 'scanning'`
4. Scan repository files (respecting `.gitignore`)
5. Detect languages present in repo
6. Start required language servers (added to the LSP server pool)
7. Build initial graph (structure only — summaries are empty)
8. Create empty rules set
9. Generate initial manifest record in `manifests` table
10. Update repo status to `'ready'`
11. Return summary to the calling agent

#### Post-Init Enrichment

After init, the AI agent can be asked to "enrich the knowledge base" which:
1. Calls `get_graph({ repoPath })` to get all nodes
2. For each node with empty summary, the AI generates a summary
3. Calls `apply_kb_updates({ repoPath, ... })` with all summaries
4. This is a one-time bulk operation

#### Hook Installation

Git hooks are installed separately from bootstrap, since they modify files inside the repo. The agent or user can install hooks via:
- CLI: `npx cortex install-hooks /path/to/repo`
- The server does **not** auto-install hooks — this is an explicit opt-in action

---

### 6.9 Web UI Dashboard (Phase 10 — Auto-Served)

**Purpose**: Visual control panel for inspecting and managing KBs across all registered repos. Automatically served on localhost when the server starts.

#### Technology

- **Vite** for dev server and production builds
- **React 18+** with TypeScript for component-driven UI
- **D3.js** for graph visualization (wrapped in React components)
- **TanStack Query** for server-state management (polling the Cortex REST API)
- **Tailwind CSS** for styling
- Auto-served on `localhost:4170` as part of the single central HTTP server

#### Architecture

The UI is a Vite+React SPA that lives inside `src/ui/`. During development, Vite's dev server handles HMR. In production (when installed via npm), the UI is pre-built to `src/ui/dist/` and served as static assets by the Cortex server.

The server exposes everything on one HTTP port (`localhost:4170`):
- `/` — React UI (static assets)
- `/mcp` — MCP Streamable HTTP endpoint (for AI agents)
- `/api/*` — REST API (for the React UI)

#### REST API Endpoints

All repo-scoped endpoints are nested under `/api/repos/:repoId/`. The API is a thin passthrough to the same services that back the MCP tools.

| Endpoint                              | Method | Maps To              |
|---------------------------------------|--------|----------------------|
| `/api/health`                         | GET    | Server health check  |
| `/api/repos`                          | GET    | `list_repos` tool    |
| `/api/repos/manifest`                 | GET    | Lookup by `?repoPath=` (for hooks) |
| `/api/repos/notify`                   | POST   | Git hook notifications |
| `/api/repos/:repoId`                  | GET    | `get_repo_status` tool |
| `/api/repos/:repoId/graph`            | GET    | `get_graph` tool     |
| `/api/repos/:repoId/rules`            | GET    | `get_rules` tool     |
| `/api/repos/:repoId/rules`            | POST   | `add_rule` tool      |
| `/api/repos/:repoId/rules/:id`        | PUT    | `update_rule` tool   |
| `/api/repos/:repoId/manifest`         | GET    | `get_manifest` tool  |
| `/api/repos/:repoId/context/:file`    | GET    | `get_context` tool   |
| `/api/repos/:repoId/conflicts`        | GET    | `get_conflicts` tool |
| `/api/repos/:repoId/conflicts/:id`    | POST   | `resolve_conflict`   |
| `/api/repos/:repoId/stats`            | GET    | `kb://stats` resource|
| `/api/rules/cross-repo`               | GET    | Cross-repo rules     |
| `/api/rules/cross-repo`               | POST   | Add cross-repo rule  |

#### Pages / Views

| Page              | Features                                              |
|-------------------|-------------------------------------------------------|
| Dashboard Home    | Cross-repo overview: all repos with status, total stats, recent activity across repos |
| Repo Selector     | Global sidebar dropdown to switch active repo context; persisted in URL |
| Graph Viewer      | Interactive force-directed dependency graph (D3 + React), click nodes to inspect symbols, filter by language/module |
| Rule Manager      | CRUD rules with inline editing, filter by type/scope/tag, version history; shows both repo-specific and cross-repo rules |
| Branch Selector   | View KB for different branches, compare deltas        |
| Context Inspector | Simulate `get_context` for any file, preview what an AI agent sees |
| Manifest Status   | Current sync state, drift indicator, last sync time   |
| Conflict Resolver | View and resolve merge conflicts with side-by-side diff |

The **Repo Selector** is always visible in the sidebar. Selecting a repo scopes all other views (graph, rules, manifest, etc.) to that repo. The Dashboard Home is the only view that shows cross-repo data.

#### Auto-Serve Behavior

When the server starts (`npx cortex serve`), it:

1. Initializes the central SQLite database at `~/.cortex/knowledge.db`
2. Starts the HTTP server on `localhost:4170` (configurable via `server.port`)
3. Registers the MCP Streamable HTTP endpoint at `/mcp`
4. Serves the REST API at `/api/*`
5. Serves the pre-built React app at `/`
6. Opens the browser automatically (if `ui.autoOpen` is true in config)

```bash
npx cortex serve           # Start central server on localhost:4170
npx cortex serve --no-ui   # Server without auto-opening browser
npx cortex serve --port 4180  # Custom port
```

---

## 7. Project Configuration

### Central Config: `~/.cortex/config.json`

The server-wide configuration lives at `~/.cortex/config.json`. It controls server settings, default language server configs, and global graph settings.

```json
{
  "version": 1,
  "server": {
    "port": 4170,
    "host": "localhost"
  },
  "storage": {
    "path": "~/.cortex",
    "database": "knowledge.db"
  },
  "ui": {
    "autoOpen": true
  },
  "languageServers": {
    "typescript": {
      "enabled": true,
      "command": "typescript-language-server",
      "args": ["--stdio"]
    },
    "python": {
      "enabled": true,
      "command": "pyright-langserver",
      "args": ["--stdio"]
    }
  },
  "graph": {
    "ignorePaths": ["node_modules", "dist", "build", ".git", "coverage"],
    "maxFileSize": 1048576
  },
  "lspPool": {
    "idleTimeoutMs": 300000
  }
}
```

### Per-Repo Overrides: `<repo-root>/.cortex.json`

Individual repos can optionally have a `.cortex.json` file at their root to override central defaults. This is the only Cortex artifact in a repo's working tree.

```json
{
  "languageServers": {
    "python": {
      "enabled": false
    }
  },
  "graph": {
    "ignorePaths": ["node_modules", "dist", "build", ".git", "coverage", "generated"]
  },
  "hooks": {
    "types": ["pre-commit", "post-merge", "post-checkout"]
  }
}
```

Merge strategy: per-repo values override central values at the key level. If a repo disables Python, only that repo skips pyright — other repos still use the central default.

---

## 8. CLI Commands

```bash
# Server
npx cortex serve                           # Start central server on localhost:4170
npx cortex serve --port 4180               # Custom port
npx cortex serve --no-ui                   # Don't auto-open browser

# Repo management
npx cortex repos                           # List all registered repos
npx cortex repos add /path/to/repo         # Manually register a repo
npx cortex repos remove <repoId>           # Unregister a repo (KB data deleted)

# Per-repo operations (require server to be running)
npx cortex status /path/to/repo            # Show repo KB status + manifest
npx cortex graph /path/to/repo [file]      # Print dependency graph / subgraph
npx cortex rules /path/to/repo [--type=constraint]  # List rules for a repo
npx cortex check /path/to/repo             # Validate manifest (same as pre-commit check)
npx cortex reset /path/to/repo             # Reset KB for a repo (with confirmation)
npx cortex export /path/to/repo            # Export repo KB as JSON
npx cortex import /path/to/repo <file>     # Import KB for a repo from JSON

# Git hooks
npx cortex install-hooks /path/to/repo     # Install Git hooks for a repo
npx cortex uninstall-hooks /path/to/repo   # Remove Git hooks from a repo

# Cross-repo
npx cortex rules --cross-repo              # List cross-repo rules
```

CLI commands that operate on repos communicate with the running server via its REST API. If the server is not running, they print a message asking the user to start it.

---

## 9. Project Structure

```
cortex/
├── src/
│   ├── core/
│   │   ├── types.ts                   # All TypeScript interfaces (repo-aware)
│   │   ├── config.ts                  # Central config loader + per-repo override merging
│   │   ├── storage.ts                 # SQLite operations (CRUD, repo-partitioned)
│   │   └── errors.ts                  # Custom error types
│   ├── repo/
│   │   ├── repoManager.ts            # Register, discover, bootstrap repos
│   │   └── repoRouter.ts             # Route MCP/API calls to correct repo context
│   ├── git/
│   │   ├── gitService.ts             # Git operations wrapper (per-repo instance)
│   │   ├── diffParser.ts             # Parse git diff output
│   │   └── hookInstaller.ts          # Install/uninstall Git hooks for a repo
│   ├── lsp/
│   │   ├── registry.ts               # Language server registry
│   │   ├── serverPool.ts             # LSP server pool (keyed by repoId + language)
│   │   └── protocol.ts               # LSP request/response helpers
│   ├── graph/
│   │   ├── graphBuilder.ts           # Build graph from LSP data (repo-scoped)
│   │   ├── graphQuery.ts             # Query graph (dependencies, etc.)
│   │   └── incrementalUpdater.ts     # Incremental graph rebuild
│   ├── knowledge/
│   │   ├── ruleService.ts            # Rule CRUD + versioning (repo-aware + cross-repo)
│   │   ├── branchService.ts          # Branch-aware KB operations
│   │   └── conflictResolver.ts       # Merge conflict detection
│   ├── manifest/
│   │   ├── manifestService.ts        # Manifest generation + validation (DB-stored)
│   │   └── hashComputer.ts           # SHA-256 hash computation
│   ├── sync/
│   │   ├── syncService.ts            # Full sync orchestration
│   │   └── syncCollector.ts          # Collect data for AI agent
│   ├── server/
│   │   ├── httpServer.ts             # Central HTTP server (Express/Koa)
│   │   ├── mcpEndpoint.ts            # MCP Streamable HTTP endpoint at /mcp
│   │   └── apiRoutes.ts              # REST API routes at /api/*
│   ├── ui/
│   │   ├── index.html                # Vite entry HTML
│   │   ├── main.tsx                  # React app entry point
│   │   ├── App.tsx                   # Root component with routing
│   │   ├── vite.config.ts            # Vite config for UI build
│   │   ├── tailwind.config.ts        # Tailwind configuration
│   │   ├── components/
│   │   │   ├── Layout.tsx            # Shell layout (sidebar with repo selector + header)
│   │   │   ├── RepoSelector.tsx      # Repo dropdown in sidebar
│   │   │   ├── GraphViewer.tsx       # D3 force-directed graph (React wrapper)
│   │   │   ├── RuleManager.tsx       # Rule CRUD with inline editing
│   │   │   ├── BranchSelector.tsx    # Branch KB viewer
│   │   │   ├── ContextInspector.tsx  # Simulate get_context for a file
│   │   │   ├── ManifestStatus.tsx    # Sync state + drift indicator
│   │   │   ├── ConflictResolver.tsx  # Merge conflict resolution UI
│   │   │   └── Dashboard.tsx         # Cross-repo overview stats + recent activity
│   │   ├── hooks/
│   │   │   ├── useRepos.ts           # TanStack Query hook for repo list
│   │   │   ├── useGraph.ts           # TanStack Query hook for graph data
│   │   │   ├── useRules.ts           # TanStack Query hook for rules
│   │   │   └── useManifest.ts        # TanStack Query hook for manifest
│   │   └── lib/
│   │       ├── api-client.ts         # Typed fetch wrapper for REST API (repo-scoped)
│   │       └── graph-layout.ts       # D3 force simulation config
│   ├── cli/
│   │   ├── index.ts                  # CLI entry point
│   │   ├── commands/                 # One file per command
│   │   │   ├── serve.ts
│   │   │   ├── repos.ts              # repos list/add/remove
│   │   │   ├── status.ts
│   │   │   ├── check.ts
│   │   │   ├── hooks.ts              # install-hooks / uninstall-hooks
│   │   │   └── ...
│   │   └── utils.ts                  # CLI formatting helpers + server health check
│   └── index.ts                      # Main entry point
├── scripts/
│   ├── pre-commit.sh                 # Git pre-commit hook template (calls Cortex server via HTTP)
│   ├── post-merge.sh                 # Git post-merge hook template (notifies Cortex server)
│   └── post-checkout.sh              # Git post-checkout hook template (notifies Cortex server)
├── tests/
│   ├── core/
│   ├── repo/
│   ├── git/
│   ├── lsp/
│   ├── graph/
│   ├── knowledge/
│   ├── manifest/
│   ├── sync/
│   ├── server/
│   ├── mcp/
│   └── fixtures/                     # Test repos, mock data
├── docs/
│   └── PROJECT-REQUIREMENTS.md       # This file
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.json
├── .prettierrc
├── .gitignore
└── README.md
```

---

## 10. Technology Stack

| Component              | Package                           | Version  | Purpose                        |
|------------------------|-----------------------------------|----------|--------------------------------|
| Runtime                | Node.js                           | >= 20    | JavaScript runtime             |
| Language               | TypeScript                        | >= 5.4   | Type safety                    |
| MCP SDK                | @modelcontextprotocol/sdk         | latest   | MCP server (Streamable HTTP)   |
| HTTP Server            | express                           | latest   | Central HTTP server            |
| SQLite                 | better-sqlite3                    | latest   | Central database               |
| Git                    | simple-git                        | latest   | Git operations                 |
| LSP Protocol           | vscode-languageserver-protocol    | latest   | LSP type definitions           |
| LSP Transport          | vscode-jsonrpc                    | latest   | JSON-RPC over stdio            |
| Hashing                | Node.js crypto (built-in)         | —        | SHA-256 manifest hashing       |
| CLI                    | commander                         | latest   | CLI argument parsing           |
| Testing                | vitest                            | latest   | Unit + integration testing     |
| UI Framework           | react + react-dom                 | >= 18    | Component-driven dashboard     |
| UI Routing             | react-router-dom                  | latest   | Client-side routing            |
| UI Server State        | @tanstack/react-query             | latest   | API data fetching + caching    |
| UI Styling             | tailwindcss                       | latest   | Utility-first CSS              |
| Graph Rendering        | d3                                | latest   | Force-directed graph rendering |
| Bundler (UI)           | vite                              | latest   | Dev server + production build  |
| Linting                | eslint                            | latest   | Code quality                   |
| Formatting             | prettier                          | latest   | Code style                     |

---

## 11. Implementation Phases

### Phase 1: Project Scaffolding & Core Data Model (~2 days)

**Scope**: Bootable TypeScript project with central storage layer.

**Deliverables**:
- Project structure with `tsconfig.json`, `package.json`, ESLint, Prettier
- All TypeScript interfaces in `src/core/types.ts` (repo-aware data models)
- Central SQLite schema + migrations in `src/core/storage.ts` (repos, rules, graph_nodes, graph_edges, manifests, branch_snapshots tables)
- Central config loader + per-repo override merging in `src/core/config.ts`
- `RepoManager` in `src/repo/repoManager.ts` (register, lookup, bootstrap)
- Unit tests for storage CRUD (repo-partitioned queries)

**Exit Criteria**: `npm run build` succeeds, storage tests pass with multi-repo data isolation.

---

### Phase 2: Git Integration Layer (~1.5 days)

**Scope**: Reliable Git change detection.

**Deliverables**:
- `GitService` class wrapping `simple-git`
- Staged file detection, diff extraction, commit tracking
- Hash computation for staged content
- Unit tests with mock Git repos

**Exit Criteria**: Can detect staged files and compute deterministic hashes.

**Depends on**: Phase 1

---

### Phase 3: Structural Analysis Engine — LSP Client (~5 days)

**Scope**: Language-agnostic dependency graph via LSP with repo-aware server pool.

**Deliverables**:
- Language Server Registry (config-driven)
- `LSPServerPool` in `src/lsp/serverPool.ts` (keyed by repoId + language, idle timeout)
- `GraphBuilder` (LSP → nodes + edges, repo-scoped)
- Incremental rebuild (only changed files within a repo)
- Graph query API (dependencies, dependents, affected-by-change)
- Integration tests with tsserver

**Sub-phases**:
- 3a. `LSPServerPool` + Registry (~2 days)
- 3b. `GraphBuilder` + queries (~3 days)

**Exit Criteria**: Can build a dependency graph for a TypeScript project using tsserver. LSP servers are pooled per-repo.

**Depends on**: Phase 1

---

### Phase 4: Central HTTP Server + MCP Endpoint (~4 days)

**Scope**: Single HTTP server hosting MCP (Streamable HTTP), REST API, and static UI assets.

**Deliverables**:
- Central HTTP server in `src/server/httpServer.ts` (Express)
- MCP Streamable HTTP endpoint at `/mcp` in `src/server/mcpEndpoint.ts`
- REST API routes at `/api/*` in `src/server/apiRoutes.ts`
- Repo Router in `src/repo/repoRouter.ts` (routes requests to correct repo context)
- All MCP tools registered: `list_repos`, `get_repo_status`, `sync_kb`, `apply_kb_updates`, `get_context`, `get_rules`, `add_rule`, `update_rule`, `get_graph`, `get_manifest`, `init_kb`
- All MCP resources: `kb://repos`, `kb://repos/{repoId}/manifest`, `kb://repos/{repoId}/rules`, `kb://repos/{repoId}/graph`, `kb://repos/{repoId}/stats`
- Auto-bootstrap flow (unknown repoPath triggers init)
- Integration tests for each tool (multi-repo scenarios)

**Exit Criteria**: Cursor can connect to `http://localhost:4170/mcp` and call tools with different `repoPath` values.

**Depends on**: Phase 1, 2, 3

---

### Phase 5: Manifest & Pre-commit Enforcement (~2 days)

**Scope**: Deterministic enforcement layer with DB-stored manifests.

**Deliverables**:
- `ManifestService` (generate, validate, compare — DB-stored per-repo)
- Pre-commit hook shell script (calls Cortex server via HTTP)
- Post-merge and post-checkout hook scripts (notify Cortex server via HTTP)
- Hook installer CLI command (`install-hooks /path/to/repo`)
- Integration test: modify file → commit blocked → sync → commit succeeds

**Exit Criteria**: Pre-commit hook correctly blocks/allows commits by querying the central server.

**Depends on**: Phase 2, 4

---

### Phase 6: Declarative Knowledge — Rules (~2 days)

**Scope**: Full rule management with versioning, scoping, and cross-repo support.

**Deliverables**:
- `RuleService` (CRUD, versioning, scoping — repo-aware)
- Rule types: constraint, lesson, preference
- Scope: cross-repo, global (repo-level), branch-specific
- Audit trail (version history)
- Cross-repo rules (apply to all repos)
- Unit tests for all operations (including multi-repo isolation)

**Exit Criteria**: Can add/edit/deactivate rules per-repo and cross-repo with proper versioning.

**Depends on**: Phase 1

---

### Phase 7: Knowledge Synchronization Workflow (~2 days)

**Scope**: Full sync orchestration that the AI agent drives.

**Deliverables**:
- `SyncService` orchestrating the complete workflow
- `SyncCollector` packaging data for AI agent
- Incremental sync (only changed files)
- Manifest refresh after apply
- End-to-end test: stage changes → sync → apply → manifest valid

**Exit Criteria**: Complete sync cycle works via MCP tools.

**Depends on**: Phase 2, 3, 4, 5, 6

---

### Phase 8: Branch-Aware Knowledge (~3 days)

**Scope**: Independent KB per branch with inheritance.

**Deliverables**:
- `BranchService` (snapshot, delta, computed view)
- Post-checkout hook integration
- Branch create/switch/delete handling
- Merge conflict detection and surfacing
- `get_conflicts` and `resolve_conflict` MCP tools

**Exit Criteria**: Can switch branches and see branch-specific KB.

**Depends on**: Phase 7

---

### Phase 9: Auto-Bootstrap / Init System (~2 days)

**Scope**: Auto-discovery and initialization of repos on first MCP call.

**Deliverables**:
- Auto-bootstrap flow in `RepoManager` (triggered by unknown `repoPath`)
- `repos add` CLI command for manual registration
- Full repo scan with progress reporting
- Initial graph build (structural, no AI summaries)
- Initial manifest generation (DB record)
- Git hook installation as separate opt-in step
- `init_kb` MCP tool (explicit init with mode selection)

**Exit Criteria**: Agent calls any MCP tool with a new repo path → repo is auto-bootstrapped and ready on the next call.

**Depends on**: Phase 3, 4, 5

---

### Phase 10: React Web UI Dashboard (~5 days)

**Scope**: Multi-repo React dashboard, auto-served by the central HTTP server.

**Deliverables**:
- Vite + React + TypeScript SPA with Tailwind CSS
- Repo selector in sidebar (dropdown showing all registered repos)
- Dashboard home page with cross-repo overview (all repos, sync status, stats)
- D3.js force-directed dependency graph wrapped in React component (repo-scoped)
- Rule manager with inline editing, filtering, and version history (repo + cross-repo)
- Branch selector with delta comparison
- Manifest status with drift indicator
- Context inspector (simulate `get_context` for any file in selected repo)
- Conflict resolver with side-by-side diff view
- Static assets served at `/` by the existing central HTTP server
- TanStack Query for data fetching with polling (repo-scoped API calls)
- Pre-built for production (`vite build`), dev mode with HMR

**Exit Criteria**: Running `npx cortex serve` opens a React dashboard at `localhost:4170` where you can switch between repos, visualize graphs, manage rules, and inspect KB state.

**Depends on**: Phase 4

---

## 12. Parallelism & Critical Path

```
Week 1:  Phase 1 ──→ Phase 2 ──→ Phase 5
                 ├──→ Phase 3a ──→ Phase 3b
                 └──→ Phase 6

Week 2:  Phase 3b ──→ Phase 4 ──→ Phase 7

Week 3:  Phase 7 ──→ Phase 8
         Phase 4 ──→ Phase 10
         Phase 3+4+5 ──→ Phase 9

Week 4:  Phase 10 (continued) + testing + polish
```

**Critical path**: Phase 1 → Phase 3 → Phase 4 → Phase 7 → Phase 8

---

## 13. Testing Strategy

| Test Type    | Tool   | Scope                                           |
|--------------|--------|-------------------------------------------------|
| Unit         | Vitest | Every service class, isolated with mocks         |
| Integration  | Vitest | MCP tools end-to-end, Git hooks, multi-repo scenarios |
| LSP          | Vitest | LSPServerPool with real tsserver                  |
| Multi-repo   | Vitest | Two repos registered, data isolation verified    |
| E2E          | Shell  | Full workflow: serve → agent connects → auto-bootstrap → sync → commit |

**Coverage target**: >= 90% on all new code.

---

## 14. Security Considerations

- No secrets stored in KB (rules are architectural, not credentials)
- Central SQLite database is local-only (`~/.cortex/`), never transmitted
- Language servers run locally with no network access
- HTTP server binds to `localhost` only — not exposed to the network
- MCP endpoint and REST API are localhost-only (no authentication needed)
- Web UI runs on localhost only
- Git hooks are inspectable shell scripts that make local HTTP calls

---

## 15. Success Criteria

| Criterion                              | Validation                                  |
|----------------------------------------|---------------------------------------------|
| KB persists across sessions            | Restart server — all repo KBs intact        |
| Multi-repo isolation                   | Two repos have independent rules and graphs |
| Auto-bootstrap works                   | Agent calls tool with new repoPath → auto-init |
| Graph reflects actual code             | Compare graph edges with actual imports      |
| Pre-commit blocks on drift             | Modify file, commit without sync → blocked  |
| Pre-commit allows after sync           | Sync KB → commit succeeds                   |
| Any MCP client works                   | Test with both Cursor and Claude Code connecting to same server |
| Multiple agents simultaneously         | Two agents on different repos work concurrently |
| New language = config only             | Add Python server config → graph works       |
| Branch KB is independent               | Different rules on different branches        |
| Cross-repo rules work                  | Add cross-repo rule → visible in all repos  |
| Human approval required                | No auto-applied changes in KB               |
| UI shows all repos                     | Repo dropdown lists all registered repos    |

---

## 16. Future Enhancements (Post-MVP)

- **Prompt templates**: Auto-generate system prompts from KB for AI agents
- **KB diffing**: Visual diff between branch KBs
- **Team sharing**: Export/import KB for team alignment
- **Metrics**: Track how often KB is consulted, drift frequency
- **VS Code extension**: Native sidebar instead of web UI
- **Monorepo packages**: Per-package KBs within a single repo
- **Remote server**: Optionally run Cortex on a remote host for team-wide access (with auth)
