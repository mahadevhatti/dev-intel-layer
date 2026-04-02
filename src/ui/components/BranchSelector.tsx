import { useParams } from 'react-router-dom';
import { useManifest } from '../hooks/useManifest';
import { useRepoDetail } from '../hooks/useRepos';
import {
  GitBranch, Info, Clock, Hash, FileText, GitGraph, BookOpen,
  CheckCircle, AlertCircle, ArrowRightLeft,
} from 'lucide-react';

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ready: 'bg-emerald-400',
    scanning: 'bg-amber-400 animate-pulse',
    error: 'bg-red-400',
    initialized: 'bg-zinc-500',
  };
  return <span className={`h-2 w-2 rounded-full inline-block ${colorMap[status] ?? 'bg-zinc-600'}`} />;
}

export function BranchSelector() {
  const { repoId } = useParams();
  const { data: manifest, isLoading: manifestLoading } = useManifest(repoId);
  const { data: repoDetail, isLoading: repoLoading } = useRepoDetail(repoId);

  if (manifestLoading || repoLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-48 rounded-lg bg-zinc-800 animate-pulse" />
        <div className="card h-24 animate-pulse bg-zinc-800/50" />
        <div className="card h-40 animate-pulse bg-zinc-800/50" />
      </div>
    );
  }

  const repo = repoDetail?.repo;
  const stats = repoDetail?.stats;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <GitBranch size={20} /> Branch Knowledge
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          View KB state across branches
        </p>
      </div>

      {/* Current branch card */}
      <div className="card">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Current Branch</h3>
        <div className="flex items-center gap-4 rounded-lg bg-zinc-800/50 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/10">
            <GitBranch size={18} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-medium text-zinc-200">
              {manifest?.branchName ?? 'unknown'}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
              {manifest ? (
                <>
                  <span className="font-mono">{manifest.baseCommit.substring(0, 10)}</span>
                  <span className="text-zinc-700">·</span>
                  <span>{manifest.indexedFileCount} files indexed</span>
                </>
              ) : (
                <span>No manifest available</span>
              )}
            </div>
          </div>
          {repo && <StatusDot status={repo.status} />}
        </div>
      </div>

      {/* KB summary */}
      {manifest && stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card flex items-center gap-3">
            <GitGraph size={16} className="text-indigo-400 shrink-0" />
            <div>
              <div className="text-lg font-bold text-zinc-200">{stats.nodeCount}</div>
              <div className="text-[10px] text-zinc-500">Graph Nodes</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <ArrowRightLeft size={16} className="text-emerald-400 shrink-0" />
            <div>
              <div className="text-lg font-bold text-zinc-200">{stats.edgeCount}</div>
              <div className="text-[10px] text-zinc-500">Graph Edges</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <BookOpen size={16} className="text-amber-400 shrink-0" />
            <div>
              <div className="text-lg font-bold text-zinc-200">{stats.ruleCount}</div>
              <div className="text-[10px] text-zinc-500">Active Rules</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Clock size={16} className="text-zinc-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-zinc-200">
                {new Date(manifest.lastSyncedAt).toLocaleDateString()}
              </div>
              <div className="text-[10px] text-zinc-500">Last Synced</div>
            </div>
          </div>
        </div>
      )}

      {/* Repository detail */}
      {repo && (
        <div className="card">
          <h3 className="mb-3 text-sm font-medium text-zinc-300">Repository Info</h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Name</span>
              <span className="text-zinc-200 font-medium">{repo.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Status</span>
              <div className="flex items-center gap-2">
                <StatusDot status={repo.status} />
                <span className={`badge badge-status-${repo.status}`}>{repo.status}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Languages</span>
              <div className="flex gap-1">
                {repo.languages.map((lang) => (
                  <span key={lang} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{lang}</span>
                ))}
              </div>
            </div>
            {manifest && (
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Manifest Version</span>
                <span className="text-zinc-400 font-mono text-xs">v{manifest.version}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hook status */}
      <div className="card flex items-start gap-3 border-indigo-500/20 bg-indigo-500/5">
        <Info size={16} className="mt-0.5 shrink-0 text-indigo-400" />
        <div className="text-xs text-indigo-300/80 space-y-2">
          <p>
            <strong>Branch snapshots</strong> are captured automatically when you switch branches via Git.
            The <code className="text-indigo-400">post-checkout</code> hook notifies the DIL server, which saves
            the current branch delta and loads the target branch context.
          </p>
          <p>
            To install hooks, run:
            <code className="block mt-1 bg-zinc-800/50 rounded px-2 py-1 text-indigo-400 font-mono">
              npx dev-intel hooks install /path/to/repo
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
