import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDocs, useDocContent, useDocReferences, useScanDocs } from '../hooks/useDocs';
import type { RepoDocument, DocType } from '../lib/api-client';
import {
  FileText,
  BookOpen,
  ScrollText,
  Landmark,
  GitCompare,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Clock,
  AlertTriangle,
  FileCode,
  FolderOpen,
} from 'lucide-react';

const DOC_TYPE_CONFIG: Record<DocType, { label: string; icon: React.ElementType; color: string }> = {
  'cursor-rule': { label: 'Cursor Rules', icon: FileCode, color: 'text-indigo-400' },
  'agent-guide': { label: 'Agent Guides', icon: BookOpen, color: 'text-emerald-400' },
  'contributing': { label: 'Contributing', icon: ScrollText, color: 'text-blue-400' },
  'readme': { label: 'README', icon: FileText, color: 'text-zinc-300' },
  'architecture': { label: 'Architecture', icon: Landmark, color: 'text-amber-400' },
  'adr': { label: 'ADRs', icon: GitCompare, color: 'text-purple-400' },
  'changelog': { label: 'Changelog', icon: Clock, color: 'text-cyan-400' },
  'docs': { label: 'Documentation', icon: FolderOpen, color: 'text-teal-400' },
  'other': { label: 'Other', icon: FileText, color: 'text-zinc-500' },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function FreshnessBadge({ lastModified }: { lastModified: string }) {
  const days = daysSince(lastModified);
  if (days <= 7) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Fresh</span>;
  if (days <= 30) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">~{days}d ago</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{days}d old</span>;
}

function DocTree({
  docs,
  selectedId,
  onSelect,
}: {
  docs: RepoDocument[];
  selectedId: string | null;
  onSelect: (doc: RepoDocument) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const grouped = docs.reduce<Record<string, RepoDocument[]>>((acc, doc) => {
    const group = doc.docType;
    if (!acc[group]) acc[group] = [];
    acc[group].push(doc);
    return acc;
  }, {});

  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const order: DocType[] = ['cursor-rule', 'agent-guide', 'readme', 'architecture', 'contributing', 'adr', 'docs', 'changelog', 'other'];
    return order.indexOf(a as DocType) - order.indexOf(b as DocType);
  });

  const toggleGroup = (type: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {sortedTypes.map(type => {
        const config = DOC_TYPE_CONFIG[type as DocType] ?? DOC_TYPE_CONFIG.other;
        const Icon = config.icon;
        const isCollapsed = collapsed.has(type);
        const items = grouped[type];

        return (
          <div key={type}>
            <button
              onClick={() => toggleGroup(type)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs hover:bg-zinc-800 transition-colors"
            >
              {isCollapsed ? <ChevronRight size={12} className="text-zinc-600" /> : <ChevronDown size={12} className="text-zinc-600" />}
              <Icon size={14} className={config.color} />
              <span className="text-zinc-300 font-medium">{config.label}</span>
              <span className="ml-auto text-[10px] text-zinc-600">{items.length}</span>
            </button>
            {!isCollapsed && (
              <div className="ml-5 space-y-0.5">
                {items.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => onSelect(doc)}
                    className={`flex items-center gap-2 w-full px-2 py-1 rounded text-xs transition-colors truncate ${
                      selectedId === doc.id
                        ? 'bg-indigo-600/10 text-indigo-400'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <FileText size={12} className="shrink-0" />
                    <span className="truncate">{doc.filePath}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocContentView({ repoId, doc }: { repoId: string; doc: RepoDocument }) {
  const { data: content, isLoading } = useDocContent(repoId, doc.id);
  const { data: references } = useDocReferences(repoId, doc.id);
  const navigate = useNavigate();
  const config = DOC_TYPE_CONFIG[doc.docType] ?? DOC_TYPE_CONFIG.other;
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon size={16} className={config.color} />
            <h2 className="text-lg font-semibold text-zinc-100 truncate">{doc.title}</h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="font-mono">{doc.filePath}</span>
            <span>{formatSize(doc.sizeBytes)}</span>
            <FreshnessBadge lastModified={doc.lastModifiedAt} />
          </div>
        </div>
        <span className={`badge ${config.color} bg-zinc-800 shrink-0`}>{config.label}</span>
      </div>

      {/* Markdown content */}
      {isLoading ? (
        <div className="card animate-pulse h-64 bg-zinc-800/50" />
      ) : content ? (
        <div className="card prose prose-invert prose-sm max-w-none
          prose-headings:text-zinc-200 prose-p:text-zinc-400 prose-a:text-indigo-400
          prose-code:text-indigo-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-zinc-800 prose-pre:border prose-pre:border-zinc-700
          prose-strong:text-zinc-300 prose-li:text-zinc-400
          prose-th:text-zinc-300 prose-td:text-zinc-400
          prose-hr:border-zinc-700
          overflow-x-auto">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
      ) : (
        <div className="card py-8 text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-amber-400" />
          <p className="text-sm text-zinc-400">Could not load document content</p>
        </div>
      )}

      {/* Cross-references */}
      {references && references.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
            <ExternalLink size={14} />
            Referenced Files ({references.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {references.map(ref => (
              <button
                key={ref}
                onClick={() => navigate(`/repos/${doc.repoId}/graph?file=${encodeURIComponent(ref)}`)}
                className="text-xs px-2 py-1 rounded bg-zinc-800 text-indigo-400 hover:bg-zinc-700 transition-colors font-mono"
              >
                {ref}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentViewer() {
  const { repoId } = useParams();
  const { data: docs, isLoading } = useDocs(repoId);
  const scanMutation = useScanDocs(repoId);
  const [selectedDoc, setSelectedDoc] = useState<RepoDocument | null>(null);

  if (!repoId) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Documents</h1>
          <p className="mt-1 text-sm text-zinc-500">Repository documentation, rules, and guides</p>
        </div>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="btn-secondary text-xs"
        >
          <RefreshCw size={14} className={scanMutation.isPending ? 'animate-spin' : ''} />
          {scanMutation.isPending ? 'Scanning...' : 'Scan Docs'}
        </button>
      </div>

      {scanMutation.isSuccess && (
        <div className="card mb-4 text-xs text-zinc-400 flex items-center gap-2 py-2">
          <span className="text-emerald-400">Scan complete:</span>
          <span>{scanMutation.data.added} added</span>
          <span className="text-zinc-600">|</span>
          <span>{scanMutation.data.updated} updated</span>
          <span className="text-zinc-600">|</span>
          <span>{scanMutation.data.removed} removed</span>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-[240px_1fr] gap-4">
          <div className="card h-96 animate-pulse bg-zinc-800/50" />
          <div className="card h-96 animate-pulse bg-zinc-800/50" />
        </div>
      ) : !docs || docs.length === 0 ? (
        <div className="card py-12 text-center">
          <FileText size={48} className="mx-auto mb-4 text-zinc-700" />
          <p className="text-zinc-300 font-medium">No documents found</p>
          <p className="mt-1 text-sm text-zinc-500">
            Click "Scan Docs" to discover documentation files in this repository.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-4 items-start">
          {/* Left: Doc tree */}
          <div className="card max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-2">
              {docs.length} documents
            </div>
            <DocTree docs={docs} selectedId={selectedDoc?.id ?? null} onSelect={setSelectedDoc} />
          </div>

          {/* Right: Content */}
          <div>
            {selectedDoc ? (
              <DocContentView repoId={repoId} doc={selectedDoc} />
            ) : (
              <div className="card py-16 text-center">
                <BookOpen size={32} className="mx-auto mb-3 text-zinc-700" />
                <p className="text-sm text-zinc-400">Select a document to view</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
