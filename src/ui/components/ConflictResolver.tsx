import { useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

export function ConflictResolver() {
  const { repoId } = useParams();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <AlertTriangle size={20} /> Conflict Resolver
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Resolve knowledge base conflicts after merges
        </p>
      </div>

      {/* No conflicts state */}
      <div className="card py-12 text-center">
        <CheckCircle size={48} className="mx-auto mb-3 text-emerald-500/40" />
        <p className="text-sm text-zinc-300">No conflicts detected</p>
        <p className="mt-1 text-xs text-zinc-500">
          Conflicts appear after merging branches with divergent KB changes.
        </p>
      </div>

      <div className="card flex items-start gap-3 border-indigo-500/20 bg-indigo-500/5">
        <Info size={16} className="mt-0.5 shrink-0 text-indigo-400" />
        <div className="text-xs text-indigo-300/80">
          <strong>How conflicts work:</strong> When you merge a branch, the post-merge hook notifies
          the DIL server. If both branches modified the same rules or node summaries, conflicts are
          surfaced here. You can resolve them as keep-local, accept-incoming, or provide a custom
          resolution. AI agents can also call{' '}
          <code className="text-indigo-400">get_conflicts</code> and{' '}
          <code className="text-indigo-400">resolve_conflict</code> programmatically.
        </div>
      </div>
    </div>
  );
}
