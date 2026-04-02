import { useParams } from 'react-router-dom';
import { useManifest } from '../hooks/useManifest';
import { useRepoDetail } from '../hooks/useRepos';
import { GitBranch, Info } from 'lucide-react';

export function BranchSelector() {
  const { repoId } = useParams();
  const { data: manifest } = useManifest(repoId);
  const { data: repoDetail } = useRepoDetail(repoId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <GitBranch size={20} /> Branch Knowledge
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          View and compare KB state across branches
        </p>
      </div>

      {/* Current branch */}
      <div className="card">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Current Branch</h3>
        <div className="flex items-center gap-3 rounded-lg bg-zinc-800/50 px-4 py-3">
          <GitBranch size={16} className="text-indigo-400" />
          <div>
            <div className="font-mono text-sm text-zinc-200">
              {manifest?.branchName ?? 'unknown'}
            </div>
            <div className="text-[11px] text-zinc-500">
              {manifest
                ? `Commit ${manifest.baseCommit.substring(0, 8)} · ${manifest.indexedFileCount} files indexed`
                : 'No manifest available'}
            </div>
          </div>
        </div>
      </div>

      {/* Repo info */}
      <div className="card">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Repository Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Name</span>
            <span className="text-zinc-200">{repoDetail?.repo?.name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Status</span>
            <span className={`badge badge-status-${repoDetail?.repo?.status ?? 'initialized'}`}>
              {repoDetail?.repo?.status ?? '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Languages</span>
            <span className="text-zinc-200">
              {repoDetail?.repo?.languages?.join(', ') || 'none'}
            </span>
          </div>
          {repoDetail?.stats && (
            <>
              <div className="flex justify-between">
                <span className="text-zinc-500">Graph Nodes</span>
                <span className="text-zinc-200">{repoDetail.stats.nodeCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Graph Edges</span>
                <span className="text-zinc-200">{repoDetail.stats.edgeCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Active Rules</span>
                <span className="text-zinc-200">{repoDetail.stats.ruleCount}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card flex items-start gap-3 border-indigo-500/20 bg-indigo-500/5">
        <Info size={16} className="mt-0.5 shrink-0 text-indigo-400" />
        <div className="text-xs text-indigo-300/80">
          Branch snapshots are captured automatically when you switch branches via Git.
          The post-checkout hook notifies the DIL server, which saves the current branch delta
          and loads the target branch context. Use an AI agent to compare branch knowledge.
        </div>
      </div>
    </div>
  );
}
