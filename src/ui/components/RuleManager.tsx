import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRules, useCreateRule, useUpdateRule } from '../hooks/useRules';
import type { KnowledgeRule } from '../lib/api-client';
import { BookOpen, Plus, Pencil, X, Check, Trash2, Filter } from 'lucide-react';

type RuleType = 'constraint' | 'lesson' | 'preference';

function RuleTypeBadge({ type }: { type: string }) {
  return <span className={`badge badge-${type}`}>{type}</span>;
}

function AddRuleForm({
  onAdd,
  isLoading,
}: {
  onAdd: (data: { type: string; content: string; tags?: string[] }) => void;
  isLoading: boolean;
}) {
  const [type, setType] = useState<RuleType>('constraint');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onAdd({
      type,
      content: content.trim(),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setContent('');
    setTags('');
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <div className="flex gap-3">
        <select
          className="select w-36"
          value={type}
          onChange={(e) => setType(e.target.value as RuleType)}
        >
          <option value="constraint">Constraint</option>
          <option value="lesson">Lesson</option>
          <option value="preference">Preference</option>
        </select>
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
  const [editContent, setEditContent] = useState(rule.content);

  const save = () => {
    if (editContent.trim() && editContent !== rule.content) {
      onUpdate(rule.id, { content: editContent.trim() });
    }
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-colors hover:bg-zinc-800/30">
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <RuleTypeBadge type={rule.type} />
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
            v{rule.version}
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
            {rule.scope}
          </span>
          {!rule.active && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
              inactive
            </span>
          )}
          {rule.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-400"
            >
              {tag}
            </span>
          ))}
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-sm"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button className="btn-ghost p-1" onClick={save}>
              <Check size={14} className="text-emerald-400" />
            </button>
            <button className="btn-ghost p-1" onClick={() => setEditing(false)}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-300">{rule.content}</p>
        )}

        <div className="mt-1 text-[10px] text-zinc-600">
          {rule.source} · updated {new Date(rule.updatedAt).toLocaleDateString()}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!editing && (
          <button className="btn-ghost p-1.5" onClick={() => setEditing(true)} title="Edit">
            <Pencil size={13} />
          </button>
        )}
        {rule.active && (
          <button
            className="btn-ghost p-1.5"
            onClick={() => onUpdate(rule.id, { active: false })}
            title="Deactivate"
          >
            <Trash2 size={13} className="text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
}

export function RuleManager() {
  const { repoId } = useParams();
  const { data: rules, isLoading } = useRules(repoId);
  const createMutation = useCreateRule(repoId!);
  const updateMutation = useUpdateRule(repoId!);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);

  const filteredRules = (rules ?? []).filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (!showInactive && !r.active) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
          <BookOpen size={20} /> Knowledge Rules
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
          {typeFilter !== 'all' ? ` (${typeFilter})` : ''}
        </p>
      </div>

      <AddRuleForm
        onAdd={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />

      <div className="flex items-center gap-3">
        <Filter size={14} className="text-zinc-500" />
        <select
          className="select w-auto text-xs"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          <option value="constraint">Constraints</option>
          <option value="lesson">Lessons</option>
          <option value="preference">Preferences</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Show inactive
        </label>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading rules...</div>
      ) : filteredRules.length === 0 ? (
        <div className="card py-12 text-center">
          <BookOpen size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-sm text-zinc-400">No rules yet.</p>
          <p className="mt-1 text-xs text-zinc-600">Add constraints, lessons, or preferences above.</p>
        </div>
      ) : (
        <div className="space-y-2">
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
