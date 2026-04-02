import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useManifest } from '../hooks/useManifest';
import { useRepoDetail } from '../hooks/useRepos';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { buildRepoGraph } from '../lib/api-client';
import {
  FileCheck, Clock, GitBranch, Hash, FileText, BookOpen,
  GitGraph, AlertCircle, RefreshCw, Copy, Check, ChevronRight,
  ChevronDown, FolderOpen,
} from 'lucide-react';

function CopyableHash({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg bg-zinc-800/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon size={16} className="shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-zinc-500">{label}</div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="font-mono text-sm text-zinc-200 hover:text-zinc-100 flex items-center gap-1"
          >
            {expanded ? value : value.substring(0, 16) + '...'}
            {!expanded && <ChevronRight size={12} className="text-zinc-600" />}
          </button>
        </div>
        <button onClick={copy} className="btn-ghost p-1 shrink-0" title="Copy">
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

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

function FileGroup({
  directory,
  files,
  defaultOpen,
}: {
  directory: string;
  files: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <FolderOpen size={12} className="text-zinc-500" />
        <span className="font-medium">{directory}/</span>
        <span className="text-zinc-600 ml-auto">{files.length}</span>
      </button>
      {open && (
        <div className="ml-6 space-y-0.5">
          {files.map((file) => (
            <div key={file} className="rounded px-2 py-0.5 font-mono text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400">
              {file.replace(directory + '/', '')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncedByIcon({ syncedBy }: { syncedBy: string }) {
  if (syncedBy === 'graph-build') return <RefreshCw size={12} className="text-indigo-400" />;
  if (syncedBy === 'manual') return <FileCheck size={12} className="text-emerald-400" />;
  return <GitGraph size={12} className="text-amber-400" />;
}

export function ManifestStatus() {
  const { repoId } = useParams();
  const queryClient = useQueryClient();
  const { data: manifest, isLoading } = useManifest(repoId);
  const { data: repoDetail } = useRepoDetail(repoId);

  const buildMutation = useMutation({
    mutationFn: () => buildRepoGraph(repoId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manifest', repoId] });
      queryClient.invalidateQueries({ queryKey: ['repo', repoId] });
      queryClient.invalidateQueries({ queryKey: ['graph', repoId] });
      queryClient.invalidateQueries({ queryKey: ['stats', repoId] });
    },
  });

  const groupedFiles = useMemo(() => {
    if (!manifest?.indexedFiles.length) return [];
    const groups = new Map<string, string[]>();
    for (const file of manifest.indexedFiles) {
      const parts = file.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir)!.push(file);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [manifest?.indexedFiles]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-48 rounded-lg bg-zinc-800 animate-pulse" />
        <div className="card h-20 animate-pulse bg-zinc-800/50" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-zinc-800/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
            <FileCheck size={20} /> Manifest Status
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Synchronization state of the knowledge base
          </p>
        </div>
        <button
          onClick={() => buildMutation.mutate()}
          disabled={buildMutation.isPending}
          className="btn-primary text-xs"
        >
          <RefreshCw size={13} className={buildMutation.isPending ? 'animate-spin' : ''} />
          {buildMutation.isPending ? 'Syncing...' : 'Rebuild & Sync'}
        </button>
      </div>

      {buildMutation.isSuccess && (
        <div className="card flex items-center gap-3 border-emerald-500/20 bg-emerald-500/5 py-3">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <div className="text-xs text-emerald-300">
            Graph rebuilt: {buildMutation.data.nodesCreated} nodes, {buildMutation.data.edgesCreated} edges from {buildMutation.data.filesScanned} files.
          </div>
        </div>
      )}

      {!manifest ? (
        <div className="card py-12 text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-amber-500/50" />
          <p className="text-sm text-zinc-400">No manifest generated yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Click <strong className="text-zinc-400">Rebuild & Sync</strong> above, or run{' '}
            <code className="text-zinc-400">sync_kb</code> from an AI agent.
          </p>
        </div>
      ) : (
        <>
          {/* Sync status banner */}
          <div className="card flex items-center gap-4">
            <div className={`h-3 w-3 rounded-full shrink-0 ${
              repoDetail?.repo?.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'
            }`} />
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-200">
                {repoDetail?.repo?.status === 'ready' ? 'Knowledge base synced' : 'Sync may be needed'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                <SyncedByIcon syncedBy={manifest.lastSyncedBy} />
                <span>
                  Synced {new Date(manifest.lastSyncedAt).toLocaleString()} by <strong className="text-zinc-400">{manifest.lastSyncedBy}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Hash fields (expandable + copyable) */}
          <div className="grid grid-cols-2 gap-3">
            <ManifestField label="Branch" value={manifest.branchName} icon={GitBranch} />
            <CopyableHash label="Base Commit" value={manifest.baseCommit} icon={Hash} />
            <CopyableHash label="Staged Hash" value={manifest.stagedHash} icon={Hash} />
            <ManifestField label="Last Synced" value={new Date(manifest.lastSyncedAt).toLocaleString()} icon={Clock} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-zinc-800/40 px-3 py-2.5 text-center">
              <div className="text-lg font-bold text-zinc-200">{manifest.indexedFileCount}</div>
              <div className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                <FileText size={10} /> Files
              </div>
            </div>
            <div className="rounded-lg bg-zinc-800/40 px-3 py-2.5 text-center">
              <div className="text-lg font-bold text-zinc-200">{manifest.graphNodeCount}</div>
              <div className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                <GitGraph size={10} /> Nodes
              </div>
            </div>
            <div className="rounded-lg bg-zinc-800/40 px-3 py-2.5 text-center">
              <div className="text-lg font-bold text-zinc-200">{manifest.graphEdgeCount}</div>
              <div className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                <GitGraph size={10} /> Edges
              </div>
            </div>
            <div className="rounded-lg bg-zinc-800/40 px-3 py-2.5 text-center">
              <div className="text-lg font-bold text-zinc-200">{manifest.rulesCount}</div>
              <div className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                <BookOpen size={10} /> Rules
              </div>
            </div>
          </div>

          {/* Indexed files grouped by directory */}
          {groupedFiles.length > 0 && (
            <div className="card">
              <h3 className="mb-3 text-sm font-medium text-zinc-300">
                Indexed Files ({manifest.indexedFiles.length})
              </h3>
              <div className="max-h-80 overflow-y-auto space-y-0.5">
                {groupedFiles.map(([dir, files], idx) => (
                  <FileGroup key={dir} directory={dir} files={files} defaultOpen={idx === 0} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
