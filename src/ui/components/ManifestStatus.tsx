import { useParams } from 'react-router-dom';
import { useManifest } from '../hooks/useManifest';
import { useRepoDetail } from '../hooks/useRepos';
import { FileCheck, Clock, GitBranch, Hash, FileText, BookOpen, GitGraph, AlertCircle } from 'lucide-react';

function ManifestField({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-zinc-800/40 px-4 py-3">
      <Icon size={16} className="shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-zinc-500">{label}</div>
        <div className={`truncate text-sm text-zinc-200 ${mono ? 'font-mono' : ''}`}>
          {value || '—'}
        </div>
      </div>
    </div>
  );
}

export function ManifestStatus() {
  const { repoId } = useParams();
  const { data: manifest, isLoading } = useManifest(repoId);
  const { data: repoDetail } = useRepoDetail(repoId);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center text-zinc-500">Loading manifest...</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <FileCheck size={20} /> Manifest Status
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Current synchronization state of the knowledge base
        </p>
      </div>

      {!manifest ? (
        <div className="card py-12 text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-amber-500/50" />
          <p className="text-sm text-zinc-400">No manifest generated yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Run <code className="text-zinc-400">sync_kb</code> → <code className="text-zinc-400">apply_kb_updates</code> from
            an AI agent.
          </p>
        </div>
      ) : (
        <>
          {/* Sync status indicator */}
          <div className="card flex items-center gap-4">
            <div className={`h-3 w-3 rounded-full ${
              repoDetail?.repo?.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'
            }`} />
            <div>
              <div className="text-sm font-medium text-zinc-200">
                {repoDetail?.repo?.status === 'ready' ? 'Knowledge base synced' : 'Sync may be needed'}
              </div>
              <div className="text-xs text-zinc-500">
                Last synced {new Date(manifest.lastSyncedAt).toLocaleString()} by {manifest.lastSyncedBy}
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <ManifestField label="Branch" value={manifest.branchName} icon={GitBranch} />
            <ManifestField label="Base Commit" value={manifest.baseCommit.substring(0, 12)} icon={Hash} mono />
            <ManifestField label="Staged Hash" value={manifest.stagedHash.substring(0, 16) + '...'} icon={Hash} mono />
            <ManifestField label="Last Synced" value={new Date(manifest.lastSyncedAt).toLocaleString()} icon={Clock} />
            <ManifestField label="Indexed Files" value={manifest.indexedFileCount} icon={FileText} />
            <ManifestField label="Graph Nodes" value={manifest.graphNodeCount} icon={GitGraph} />
            <ManifestField label="Graph Edges" value={manifest.graphEdgeCount} icon={GitGraph} />
            <ManifestField label="Active Rules" value={manifest.rulesCount} icon={BookOpen} />
          </div>

          {/* Indexed files */}
          {manifest.indexedFiles.length > 0 && (
            <div className="card">
              <h3 className="mb-2 text-sm font-medium text-zinc-300">
                Indexed Files ({manifest.indexedFiles.length})
              </h3>
              <div className="max-h-60 overflow-y-auto">
                <div className="space-y-0.5">
                  {manifest.indexedFiles.map((file) => (
                    <div key={file} className="rounded px-2 py-1 font-mono text-xs text-zinc-400 hover:bg-zinc-800">
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
