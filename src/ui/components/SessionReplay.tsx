import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';
import { useSession, useSessionDelta, useSessions } from '../hooks/useSessions';
import type { ActivityLogEntry } from '../lib/api-client';

function truncateId(id: string, len = 12): string {
  if (id.length <= len) return id;
  return `${id.slice(0, len)}…`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function sessionDurationMs(firstSeen: string, lastSeen: string): number {
  const a = new Date(firstSeen).getTime();
  const b = new Date(lastSeen).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, b - a);
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

const WRITE_ACTION_NAMES = new Set(['apply_kb_updates', 'add_rule', 'update_rule']);

function isWriteAction(action: string): boolean {
  const a = action.toLowerCase();
  return WRITE_ACTION_NAMES.has(a) || a.includes('apply_kb') || a.includes('add_rule') || a.includes('update_rule');
}

function EntryRow({ entry }: { entry: ActivityLogEntry }) {
  const [open, setOpen] = useState(false);
  const write = isWriteAction(entry.action);
  return (
    <div
      className={`rounded-lg border text-left ${
        write ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900/60'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">{formatTime(entry.timestamp)}</span>
        <span className={`min-w-0 flex-1 font-mono text-sm ${write ? 'text-amber-200' : 'text-zinc-300'}`}>
          {entry.action}
        </span>
        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
          {entry.durationMs}ms
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-3 py-2 font-mono text-[11px] leading-relaxed">
          <div className="mb-2 text-zinc-500">Request</div>
          <pre className="mb-3 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-zinc-400">
            {JSON.stringify(entry.request, null, 2)}
          </pre>
          <div className="mb-2 text-zinc-500">Response</div>
          <pre className="max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-zinc-400">
            {JSON.stringify(entry.response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SessionReplay() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const list = useSessions();
  const detail = useSession(sessionId);
  const delta = useSessionDelta(sessionId);

  const sortedEntries = useMemo(() => {
    const entries = detail.data ?? [];
    return [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [detail.data]);

  if (!sessionId) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Sessions</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Browse and replay agent session activity.</p>
        </div>

        {list.isLoading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            Loading sessions…
          </div>
        )}

        {list.error && (
          <div className="card border-red-500/30 text-sm text-red-400">{(list.error as Error).message}</div>
        )}

        {list.data && list.data.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <Clock size={40} className="mb-3 text-zinc-700" />
            <p className="text-sm text-zinc-400">No sessions recorded yet.</p>
            <p className="mt-1 text-xs text-zinc-600">Session summaries appear when the MCP agent logs activity.</p>
          </div>
        )}

        {list.data && list.data.length > 0 && (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Session ID</th>
                    <th className="px-4 py-3">Start</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Tool calls</th>
                    <th className="px-4 py-3">Repos</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((s) => (
                    <tr
                      key={s.sessionId}
                      className="cursor-pointer border-b border-zinc-800/80 transition-colors hover:bg-zinc-800/40"
                      onClick={() => navigate(`/sessions/${s.sessionId}`)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{truncateId(s.sessionId, 14)}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-400">{formatTime(s.firstSeen)}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-400">
                        {formatDuration(sessionDurationMs(s.firstSeen, s.lastSeen))}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-300">{s.toolCount}</td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-zinc-500">
                        {s.repos.length ? s.repos.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${s.hasErrors ? 'bg-red-500' : 'bg-emerald-500'}`}
                          title={s.hasErrors ? 'Errors' : 'OK'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  const first = sortedEntries[0]?.timestamp;
  const last = sortedEntries[sortedEntries.length - 1]?.timestamp;
  const spanMs = first && last ? sessionDurationMs(first, last) : 0;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/sessions')}
        className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft size={16} />
        Back to sessions
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-semibold text-zinc-100 break-all">{sessionId}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Duration {formatDuration(spanMs)} · {detail.data?.length ?? 0} log entries
          </p>
        </div>
      </div>

      {delta.isLoading && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" />
          Loading delta…
        </div>
      )}

      {delta.data && (
        <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Rules added</div>
            <div className="mt-1 text-2xl font-semibold text-zinc-100">{delta.data.rulesAdded}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Rules updated</div>
            <div className="mt-1 text-2xl font-semibold text-zinc-100">{delta.data.rulesUpdated}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Nodes updated</div>
            <div className="mt-1 text-2xl font-semibold text-zinc-100">{delta.data.nodesUpdated}</div>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Write actions</div>
            <div className="mt-1 text-xs text-zinc-400">
              {delta.data.writeActions.length ? delta.data.writeActions.join(', ') : '—'}
            </div>
          </div>
        </div>
      )}

      {detail.isLoading && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" />
          Loading timeline…
        </div>
      )}

      {detail.error && (
        <div className="card border-red-500/30 text-sm text-red-400">{(detail.error as Error).message}</div>
      )}

      {detail.data && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-300">Timeline</h2>
          <div className="flex max-w-3xl flex-col gap-2">
            {sortedEntries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
