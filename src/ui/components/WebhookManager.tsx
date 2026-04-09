import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchWebhooks,
  createWebhook,
  deleteWebhook,
  toggleWebhook,
  fetchRepos,
  type Webhook,
} from '../lib/api-client';
import { Webhook as WebhookIcon, Plus, Trash2, Loader2 } from 'lucide-react';

const EVENT_TYPES = [
  'rule.created',
  'rule.updated',
  'manifest.generated',
  'graph.built',
  'health.degraded',
] as const;

function WebhookRow({
  webhook,
  onToggle,
  onDelete,
  toggling,
  deleting,
}: {
  webhook: Webhook;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  toggling: boolean;
  deleting: boolean;
}) {
  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <WebhookIcon size={16} className="shrink-0 text-indigo-400" />
          <span className="truncate font-mono text-sm text-zinc-200">{webhook.url}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {webhook.events.map((ev) => (
            <span key={ev} className="rounded border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-[11px] text-zinc-400">
              {ev}
            </span>
          ))}
        </div>
        {webhook.repoId && (
          <p className="text-xs text-zinc-500">
            Repo scope: <span className="font-mono text-zinc-400">{webhook.repoId}</span>
          </p>
        )}
        {webhook.secret && (
          <p className="text-xs text-zinc-500">Secret: configured</p>
        )}
        <p className="text-[11px] text-zinc-600">Created {new Date(webhook.createdAt).toLocaleString()}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-zinc-800 pt-3 sm:border-t-0 sm:pt-0">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            className="rounded border-zinc-600 bg-zinc-800"
            checked={webhook.active}
            disabled={toggling}
            onChange={(e) => onToggle(webhook.id, e.target.checked)}
          />
          Active
        </label>
        <button
          type="button"
          className="btn-primary bg-red-600/80 hover:bg-red-600"
          disabled={deleting}
          onClick={() => onDelete(webhook.id)}
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

export function WebhookManager() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [repoId, setRepoId] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());

  const { data: webhooks = [], isLoading, error } = useQuery({
    queryKey: ['webhooks'],
    queryFn: fetchWebhooks,
  });

  const { data: repos = [] } = useQuery({
    queryKey: ['repos'],
    queryFn: fetchRepos,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createWebhook({
        url: url.trim(),
        events: Array.from(selectedEvents),
        repoId: repoId || undefined,
        secret: secret.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setUrl('');
      setSecret('');
      setRepoId('');
      setSelectedEvents(new Set());
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleWebhook(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || selectedEvents.size === 0) return;
    createMut.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Webhooks</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Register HTTP endpoints to receive Cortex events (POST JSON with optional HMAC signature).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <h2 className="text-sm font-medium text-zinc-300">Add webhook</h2>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">URL</label>
          <input
            className="input w-full"
            type="url"
            placeholder="https://example.com/cortex-hook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>
        <div>
          <span className="mb-2 block text-xs text-zinc-500">Events</span>
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPES.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  className="rounded border-zinc-600 bg-zinc-800"
                  checked={selectedEvents.has(ev)}
                  onChange={() => toggleEvent(ev)}
                />
                {ev}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Repo scope (optional)</label>
            <select className="select w-full" value={repoId} onChange={(e) => setRepoId(e.target.value)}>
              <option value="">All repositories</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Secret (optional, HMAC-SHA256)</label>
            <input
              className="input w-full"
              type="password"
              autoComplete="off"
              placeholder="Shared secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-primary"
            disabled={!url.trim() || selectedEvents.size === 0 || createMut.isPending}
          >
            {createMut.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Register webhook
          </button>
        </div>
        {createMut.isError && (
          <p className="text-sm text-red-400">{(createMut.error as Error).message}</p>
        )}
      </form>

      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Registered webhooks</h2>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}
        {error && (
          <p className="text-sm text-red-400">{(error as Error).message}</p>
        )}
        {!isLoading && !error && webhooks.length === 0 && (
          <p className="text-sm text-zinc-500">No webhooks yet. Add one above.</p>
        )}
        <div className="space-y-3">
          {webhooks.map((w) => (
            <WebhookRow
              key={w.id}
              webhook={w}
              onToggle={(id, active) => toggleMut.mutate({ id, active })}
              onDelete={(id) => deleteMut.mutate(id)}
              toggling={toggleMut.isPending && toggleMut.variables?.id === w.id}
              deleting={deleteMut.isPending && deleteMut.variables === w.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
