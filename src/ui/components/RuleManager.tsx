import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRules, useCrossRepoRules, useCreateRule, useUpdateRule, useCreateCrossRepoRule } from '../hooks/useRules';
import type { KnowledgeRule } from '../lib/api-client';
import { BookOpen, Plus, Pencil, X, Check, Trash2, Filter, Search, RotateCcw, ChevronDown, ChevronRight, Layers, Clock, Hash } from 'lucide-react';

type RuleType = 'constraint' | 'lesson' | 'preference';

function RuleTypeBadge({ type }: { type: string }) {
  return <span className={`badge badge-${type}`}>{type}</span>;
}

function TypeCountPill({
  type,
  count,
  active,
  onClick,
}: {
  type: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`badge badge-${type} cursor-pointer transition-opacity ${active ? 'opacity-100 ring-1 ring-zinc-600' : 'opacity-50 hover:opacity-75'}`}
    >
      {count} {type}{count !== 1 ? 's' : ''}
    </button>
  );
}

function AddRuleForm({
  onAdd,
  isLoading,
  showScope,
}: {
  onAdd: (data: { type: string; content: string; scope?: string; tags?: string[] }) => void;
  isLoading: boolean;
  showScope: boolean;
}) {
  const [type, setType] = useState<RuleType>('constraint');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState('global');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onAdd({
      type,
      content: content.trim(),
      scope: showScope ? scope : undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setContent('');
    setTags('');
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <div className="flex gap-3">
        <select className="select w-32" value={type} onChange={(e) => setType(e.target.value as RuleType)}>
          <option value="constraint">Constraint</option>
          <option value="lesson">Lesson</option>
          <option value="preference">Preference</option>
        </select>
        {showScope && (
          <select className="select w-32" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="global">Global</option>
            <option value="cross-repo">Cross-repo</option>
          </select>
        )}
        <input
          className="input flex-1"
          placeholder="Rule content..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <input
          className="input flex-1"
          placeholder="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!content.trim() || isLoading}>
          <Plus size={14} /> Add Rule
        </button>
      </div>
    </form>
  );
}

function RuleRow({
  rule,
  onUpdate,
}: {
  rule: KnowledgeRule;
  onUpdate: (id: string, data: Partial<KnowledgeRule>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editContent, setEditContent] = useState(rule.content);

  const save = () => {
    if (editContent.trim() && editContent !== rule.content) {
      onUpdate(rule.id, { content: editContent.trim() });
    }
    setEditing(false);
  };

  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/50 transition-colors hover:bg-zinc-800/30 ${!rule.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-zinc-600 hover:text-zinc-400 shrink-0">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <RuleTypeBadge type={rule.type} />
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">v{rule.version}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{rule.scope}</span>
            {!rule.active && (
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">inactive</span>
            )}
            {rule.tags.map((tag) => (
              <span key={tag} className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-400">{tag}</span>
            ))}
          </div>

          {editing ? (
            <div className="flex items-center gap-2">
              <input
                className="input flex-1 text-sm"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <button className="btn-ghost p-1" onClick={save}><Check size={14} className="text-emerald-400" /></button>
              <button className="btn-ghost p-1" onClick={() => setEditing(false)}><X size={14} /></button>
            </div>
          ) : (
            <p className="text-sm text-zinc-300">{rule.content}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!editing && rule.active && (
            <button className="btn-ghost p-1.5" onClick={() => setEditing(true)} title="Edit">
              <Pencil size={13} />
            </button>
          )}
          {rule.active ? (
            <button className="btn-ghost p-1.5" onClick={() => onUpdate(rule.id, { active: false })} title="Deactivate">
              <Trash2 size={13} className="text-red-400" />
            </button>
          ) : (
            <button className="btn-ghost p-1.5" onClick={() => onUpdate(rule.id, { active: true })} title="Reactivate">
              <RotateCcw size={13} className="text-emerald-400" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-2.5 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-zinc-600">ID: </span>
            <span className="text-zinc-400 font-mono">{rule.id.substring(0, 12)}...</span>
          </div>
          <div>
            <span className="text-zinc-600">Source: </span>
            <span className="text-zinc-400">{rule.source}</span>
          </div>
          <div>
            <span className="text-zinc-600">Created: </span>
            <span className="text-zinc-400">{new Date(rule.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-zinc-600">Updated: </span>
            <span className="text-zinc-400">{new Date(rule.updatedAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-zinc-600">Version: </span>
            <span className="text-zinc-400">{rule.version}</span>
          </div>
          <div>
            <span className="text-zinc-600">Scope: </span>
            <span className="text-zinc-400">{rule.scope}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function RuleManager() {
  const { repoId } = useParams();
  const { data: rules, isLoading } = useRules(repoId);
  const { data: crossRepoRules } = useCrossRepoRules();
  const createMutation = useCreateRule(repoId!);
  const updateMutation = useUpdateRule(repoId!);
  const createCrossRepoMutation = useCreateCrossRepoRule();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'repo' | 'cross-repo'>('repo');

  const allRules = tab === 'repo' ? (rules ?? []) : (crossRepoRules ?? []);

  const typeCounts = useMemo(() => {
    const active = allRules.filter((r) => r.active);
    return {
      constraint: active.filter((r) => r.type === 'constraint').length,
      lesson: active.filter((r) => r.type === 'lesson').length,
      preference: active.filter((r) => r.type === 'preference').length,
    };
  }, [allRules]);

  const filteredRules = useMemo(() => {
    return allRules.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!showInactive && !r.active) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesContent = r.content.toLowerCase().includes(q);
        const matchesTags = r.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesContent && !matchesTags) return false;
      }
      return true;
    });
  }, [allRules, typeFilter, showInactive, searchQuery]);

  const handleAdd = (data: { type: string; content: string; scope?: string; tags?: string[] }) => {
    if (tab === 'cross-repo') {
      createCrossRepoMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <BookOpen size={20} /> Knowledge Rules
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Manage constraints, lessons, and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-1">
        <button
          onClick={() => setTab('repo')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'repo' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-300'
          }`}
        >
          <BookOpen size={12} className="inline mr-1.5" />
          Repo Rules ({(rules ?? []).filter((r) => r.active).length})
        </button>
        <button
          onClick={() => setTab('cross-repo')}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'cross-repo' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-300'
          }`}
        >
          <Layers size={12} className="inline mr-1.5" />
          Cross-Repo Rules ({(crossRepoRules ?? []).filter((r) => r.active).length})
        </button>
      </div>

      <AddRuleForm
        onAdd={handleAdd}
        isLoading={createMutation.isPending || createCrossRepoMutation.isPending}
        showScope={tab === 'repo'}
      />

      {/* Type count pills + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <TypeCountPill type="constraint" count={typeCounts.constraint} active={typeFilter === 'constraint'} onClick={() => setTypeFilter(typeFilter === 'constraint' ? 'all' : 'constraint')} />
          <TypeCountPill type="lesson" count={typeCounts.lesson} active={typeFilter === 'lesson'} onClick={() => setTypeFilter(typeFilter === 'lesson' ? 'all' : 'lesson')} />
          <TypeCountPill type="preference" count={typeCounts.preference} active={typeFilter === 'preference'} onClick={() => setTypeFilter(typeFilter === 'preference' ? 'all' : 'preference')} />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5">
            <Search size={12} className="text-zinc-500" />
            <input
              className="bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none w-36"
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-zinc-600 hover:text-zinc-400">
                <X size={11} />
              </button>
            )}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Inactive
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-zinc-800/50 animate-pulse" />
          ))}
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="card py-12 text-center">
          <BookOpen size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-sm text-zinc-400">
            {searchQuery ? 'No rules match your search.' : 'No rules yet.'}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {searchQuery ? 'Try a different search term.' : 'Add constraints, lessons, or preferences above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 px-1">
            {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
            {typeFilter !== 'all' ? ` (${typeFilter})` : ''}
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </div>
          {filteredRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onUpdate={(id, data) => updateMutation.mutate({ ruleId: id, data })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
