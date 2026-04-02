import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useContext } from '../hooks/useManifest';
import { useGraph } from '../hooks/useGraph';
import { Search, FileText, GitGraph, BookOpen, ArrowRight, ChevronRight, Code, Eye, Braces } from 'lucide-react';

const RELATIONSHIP_COLORS: Record<string, string> = {
  imports: 'text-emerald-400 bg-emerald-500/10',
  imported_by: 'text-blue-400 bg-blue-500/10',
  calls: 'text-amber-400 bg-amber-500/10',
  called_by: 'text-orange-400 bg-orange-500/10',
  extends: 'text-purple-400 bg-purple-500/10',
  implements: 'text-pink-400 bg-pink-500/10',
};

function SymbolIcon({ kind }: { kind: string }) {
  const label = kind === 'function' ? 'ƒ' : kind === 'class' ? 'C' : kind === 'interface' ? 'I' : kind === 'variable' ? 'V' : kind === 'enum' ? 'E' : '•';
  return <span className="font-mono text-[10px] font-bold">{label}</span>;
}

export function ContextInspector() {
  const { repoId } = useParams();
  const { data: graphData } = useGraph(repoId);
  const [searchInput, setSearchInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [queryFile, setQueryFile] = useState<string>('');
  const [depth, setDepth] = useState(2);
  const [showPreview, setShowPreview] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const { data: context, isLoading, isFetching } = useContext(repoId, queryFile || undefined);

  const files = useMemo(() => {
    const all = graphData?.nodes.map((n) => n.filePath).sort() ?? [];
    if (!searchInput.trim()) return all;
    const q = searchInput.toLowerCase();
    return all.filter((f) => f.toLowerCase().includes(q));
  }, [graphData, searchInput]);

  const inspect = (file?: string) => {
    const target = file ?? selectedFile;
    if (!target) return;
    if (queryFile && queryFile !== target) {
      setHistory((h) => [...h, queryFile]);
    }
    setSelectedFile(target);
    setQueryFile(target);
    setSearchInput('');
  };

  const navigateBack = (file: string) => {
    const idx = history.indexOf(file);
    if (idx >= 0) {
      setHistory(history.slice(0, idx));
    }
    inspect(file);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <Search size={20} /> Context Inspector
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Preview the context an AI agent receives via <code className="text-zinc-400">get_context</code>
        </p>
      </div>

      {/* File selector with search */}
      <div className="card space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className="input pl-8"
              placeholder="Search or enter file path..."
              value={searchInput || selectedFile}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setSelectedFile('');
              }}
              onFocus={() => setSearchInput(searchInput || selectedFile)}
            />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          </div>
          <button
            className="btn-primary"
            onClick={() => inspect()}
            disabled={(!selectedFile && !searchInput) || isFetching}
          >
            <Eye size={14} />
            Inspect
          </button>
        </div>

        {/* File dropdown */}
        {searchInput && files.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800">
            {files.slice(0, 20).map((f) => (
              <button
                key={f}
                onClick={() => { setSelectedFile(f); setSearchInput(''); }}
                className="block w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 truncate font-mono"
              >
                {f}
              </button>
            ))}
            {files.length > 20 && (
              <div className="px-3 py-1.5 text-[10px] text-zinc-600">
                {files.length - 20} more files...
              </div>
            )}
          </div>
        )}

        {/* Depth control */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-500">Traversal depth:</span>
          <input
            type="range"
            min={1}
            max={4}
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value))}
            className="w-24 accent-indigo-500"
          />
          <span className="text-zinc-400 font-mono w-4 text-center">{depth}</span>
        </div>
      </div>

      {/* Breadcrumb history */}
      {history.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {history.map((file) => (
            <button
              key={file}
              onClick={() => navigateBack(file)}
              className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
            >
              {file.split('/').pop()}
            </button>
          ))}
          <ChevronRight size={10} className="text-zinc-700" />
          <span className="font-mono text-[11px] text-indigo-400">{queryFile?.split('/').pop()}</span>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-zinc-800/50" />
          ))}
        </div>
      )}

      {context && (
        <div className="space-y-4">
          {/* Preview toggle */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`btn-ghost px-2 py-1 text-xs gap-1.5 ${showPreview ? 'text-indigo-400' : ''}`}
            >
              <Braces size={12} />
              {showPreview ? 'Hide' : 'Show'} JSON Preview
            </button>
          </div>

          {showPreview && (
            <div className="card">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Code size={14} /> Agent Response Preview
              </h3>
              <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-800 p-3 text-[11px] text-zinc-400 font-mono leading-relaxed">
                {JSON.stringify(context, null, 2)}
              </pre>
            </div>
          )}

          {/* Nodes */}
          <div className="card">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <GitGraph size={14} /> Graph Nodes ({context.nodes.length})
            </h3>
            {context.nodes.length === 0 ? (
              <p className="text-xs text-zinc-500">No nodes found for this file.</p>
            ) : (
              <div className="space-y-2">
                {context.nodes.map((node) => (
                  <div key={node.id} className="rounded-lg bg-zinc-800/50 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText size={13} className="text-zinc-500" />
                      <span className="font-mono text-xs text-zinc-300">{node.filePath}</span>
                      <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">{node.language}</span>
                    </div>
                    {node.summary && (
                      <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{node.summary}</p>
                    )}
                    {node.symbols.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {node.symbols.slice(0, 15).map((s, i) => (
                          <span
                            key={i}
                            className={`rounded px-1.5 py-0.5 text-[10px] flex items-center gap-0.5 ${
                              s.exported ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
                            }`}
                          >
                            <SymbolIcon kind={s.kind} />
                            {s.name}
                          </span>
                        ))}
                        {node.symbols.length > 15 && (
                          <span className="text-[10px] text-zinc-600 px-1">+{node.symbols.length - 15} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edges */}
          {context.edges.length > 0 && (
            <div className="card">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <ArrowRight size={14} /> Dependencies ({context.edges.length})
              </h3>
              <div className="space-y-1">
                {context.edges.map((edge) => {
                  const colorCls = RELATIONSHIP_COLORS[edge.relationship] ?? 'text-zinc-400 bg-zinc-800';
                  return (
                    <div key={edge.id} className="flex items-center gap-2 text-xs text-zinc-400">
                      <span className="font-mono truncate max-w-40">{edge.source.split(':')[1]}</span>
                      <span className="text-zinc-700">→</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colorCls}`}>
                        {edge.relationship}
                      </span>
                      <span className="text-zinc-700">→</span>
                      <span className="font-mono truncate max-w-40">{edge.target.split(':')[1]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rules */}
          {context.rules.length > 0 && (
            <div className="card">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <BookOpen size={14} /> Active Rules ({context.rules.length})
              </h3>
              <div className="space-y-1.5">
                {context.rules.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-2 text-xs">
                    <span className={`badge badge-${rule.type} text-[10px] shrink-0`}>{rule.type}</span>
                    <span className="text-zinc-400">{rule.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related files */}
          {context.relatedFiles.length > 0 && (
            <div className="card">
              <h3 className="mb-2 text-sm font-medium text-zinc-300">
                Related Files ({context.relatedFiles.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {context.relatedFiles.map((f) => (
                  <button
                    key={f}
                    className="rounded bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                    onClick={() => inspect(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
