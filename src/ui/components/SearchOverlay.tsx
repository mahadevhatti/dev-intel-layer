import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileCode, FileText, Loader2, Search } from 'lucide-react';
import { searchAll } from '../lib/api-client';
import type { GraphNode, KnowledgeRule, RepoDocument } from '../lib/api-client';
import { useRepos } from '../hooks/useRepos';

type FlatResult =
  | { kind: 'rule'; key: string; rule: KnowledgeRule }
  | { kind: 'node'; key: string; node: GraphNode }
  | { kind: 'doc'; key: string; doc: RepoDocument };

export function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: repos } = useRepos();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const repoName = useCallback(
    (repoId: string) => repos?.find((r) => r.id === repoId)?.name ?? repoId,
    [repos],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 200);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchAll(debounced, 20),
    enabled: open && debounced.length > 0,
  });

  const flat: FlatResult[] = useMemo(() => {
    if (!data) return [];
    const out: FlatResult[] = [];
    for (const rule of data.rules) {
      out.push({ kind: 'rule', key: `r-${rule.id}`, rule });
    }
    for (const node of data.nodes) {
      out.push({ kind: 'node', key: `n-${node.id}`, node });
    }
    for (const doc of data.docs) {
      out.push({ kind: 'doc', key: `d-${doc.id}`, doc });
    }
    return out;
  }, [data]);

  useEffect(() => {
    setSelected(0);
  }, [debounced, data]);

  useEffect(() => {
    if (open) {
      setInput('');
      setDebounced('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const go = useCallback(
    (item: FlatResult) => {
      if (item.kind === 'rule') {
        const r = item.rule;
        if (r.repoId) navigate(`/repos/${r.repoId}/rules`);
        else navigate('/');
      } else if (item.kind === 'node') {
        navigate(`/repos/${item.node.repoId}/graph`);
      } else {
        navigate(`/repos/${item.doc.repoId}/docs`);
      }
      onClose();
    },
    [navigate, onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!flat.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, flat.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && flat[selected]) {
        e.preventDefault();
        go(flat[selected]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, selected, go, onClose]);

  if (!open) return null;

  const rules = data?.rules ?? [];
  const nodes = data?.nodes ?? [];
  const docs = data?.docs ?? [];

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close search"
      />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <Search size={18} className="shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search rules, files, docs…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
            autoComplete="off"
            autoCorrect="off"
          />
          {isFetching && <Loader2 size={16} className="animate-spin text-zinc-500" />}
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {!debounced && (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">Type to search across all repositories</p>
          )}
          {debounced && !isFetching && flat.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">No results</p>
          )}

          {rules.length > 0 && (
            <div className="mb-3">
              <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Rules
              </div>
              {rules.map((rule) => {
                const idx = flat.findIndex((f) => f.kind === 'rule' && f.rule.id === rule.id);
                const active = idx === selected;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => go({ kind: 'rule', key: `r-${rule.id}`, rule })}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                      active ? 'bg-indigo-600/20 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <BookOpen size={16} className="mt-0.5 shrink-0 text-indigo-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-zinc-200">{rule.content.slice(0, 120)}{rule.content.length > 120 ? '…' : ''}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {rule.repoId ? repoName(rule.repoId) : 'Cross-repo'} · {rule.type}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {nodes.length > 0 && (
            <div className="mb-3">
              <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Files
              </div>
              {nodes.map((node) => {
                const idx = flat.findIndex((f) => f.kind === 'node' && f.node.id === node.id);
                const active = idx === selected;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => go({ kind: 'node', key: `n-${node.id}`, node })}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                      active ? 'bg-indigo-600/20 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <FileCode size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs text-zinc-200 truncate">{node.filePath}</div>
                      {node.summary && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{node.summary}</div>
                      )}
                      <div className="mt-0.5 text-[11px] text-zinc-600">{repoName(node.repoId)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Docs
              </div>
              {docs.map((doc) => {
                const idx = flat.findIndex((f) => f.kind === 'doc' && f.doc.id === doc.id);
                const active = idx === selected;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => go({ kind: 'doc', key: `d-${doc.id}`, doc })}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                      active ? 'bg-indigo-600/20 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <FileText size={16} className="mt-0.5 shrink-0 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-zinc-200">{doc.title}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-zinc-500 truncate">{doc.filePath}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-600">{repoName(doc.repoId)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
