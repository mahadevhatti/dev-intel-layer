import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useContext } from '../hooks/useManifest';
import { useGraph } from '../hooks/useGraph';
import { Search, FileText, GitGraph, BookOpen, ArrowRight } from 'lucide-react';

export function ContextInspector() {
  const { repoId } = useParams();
  const { data: graphData } = useGraph(repoId);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [queryFile, setQueryFile] = useState<string>('');

  const { data: context, isLoading, isFetching } = useContext(repoId, queryFile || undefined);

  const files = graphData?.nodes.map((n) => n.filePath).sort() ?? [];

  const inspect = () => {
    if (selectedFile) setQueryFile(selectedFile);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <Search size={20} /> Context Inspector
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Preview the context an AI agent receives for any file via <code className="text-zinc-400">get_context</code>
        </p>
      </div>

      {/* File selector */}
      <div className="card">
        <div className="flex gap-2">
          {files.length > 0 ? (
            <select
              className="select flex-1"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
            >
              <option value="">Select a file...</option>
              {files.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          ) : (
            <input
              className="input flex-1"
              placeholder="Enter file path (e.g., src/auth.ts)"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
            />
          )}
          <button
            className="btn-primary"
            onClick={inspect}
            disabled={!selectedFile || isFetching}
          >
            <Search size={14} />
            Inspect
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="py-8 text-center text-sm text-zinc-500">Loading context...</div>
      )}

      {context && (
        <div className="space-y-4">
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
                  <div key={node.id} className="rounded-lg bg-zinc-800/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-zinc-500" />
                      <span className="font-mono text-xs text-zinc-300">{node.filePath}</span>
                      <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {node.language}
                      </span>
                    </div>
                    {node.summary && (
                      <p className="mt-1 text-xs text-zinc-400">{node.summary}</p>
                    )}
                    {node.symbols.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {node.symbols.slice(0, 10).map((s, i) => (
                          <span key={i} className="text-[10px] text-zinc-500">
                            {s.name}
                          </span>
                        ))}
                        {node.symbols.length > 10 && (
                          <span className="text-[10px] text-zinc-600">
                            +{node.symbols.length - 10} more
                          </span>
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
                {context.edges.map((edge) => (
                  <div key={edge.id} className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="font-mono">{edge.source.split(':')[1]}</span>
                    <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px]">
                      {edge.relationship}
                    </span>
                    <span className="font-mono">{edge.target.split(':')[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rules */}
          {context.rules.length > 0 && (
            <div className="card">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <BookOpen size={14} /> Active Rules ({context.rules.length})
              </h3>
              <div className="space-y-1">
                {context.rules.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-2 text-xs">
                    <span className={`badge badge-${rule.type} text-[10px]`}>{rule.type}</span>
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
              <div className="flex flex-wrap gap-1">
                {context.relatedFiles.map((f) => (
                  <button
                    key={f}
                    className="rounded bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                    onClick={() => {
                      setSelectedFile(f);
                      setQueryFile(f);
                    }}
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
