import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText,
  Clock,
  AlertTriangle,
  Zap,
  Search,
  Radio,
} from 'lucide-react';
import { useLogs, useLogStats, useLogStream } from '../hooks/useLogs';
import type { ActivityLogEntry, LogFilters } from '../lib/api-client';

function StatCard({
  label,
  value,
  icon: Icon,
  sublabel,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  sublabel?: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-400">
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold text-zinc-100">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
        {sublabel && <div className="text-[10px] text-zinc-600">{sublabel}</div>}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function sourceBadgeClass(source: ActivityLogEntry['source']): string {
  switch (source) {
    case 'mcp':
      return 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25';
    case 'rest':
      return 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/25';
    case 'hook':
      return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25';
    default:
      return 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-600/40';
  }
}

function statusBadgeClass(status: ActivityLogEntry['status']): string {
  return status === 'success'
    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
    : 'bg-red-500/15 text-red-300 ring-1 ring-red-500/25';
}

type TimeRange = '1h' | '6h' | '24h' | 'all';

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ActivityLogs() {
  const [source, setSource] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [liveTail, setLiveTail] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [streamEntries, setStreamEntries] = useState<ActivityLogEntry[]>([]);
  const [enterIds, setEnterIds] = useState<Set<string>>(new Set());

  const since = useMemo(() => {
    if (timeRange === 'all') return undefined;
    const ms =
      timeRange === '1h' ? 3600_000 : timeRange === '6h' ? 3600_000 * 6 : 3600_000 * 24;
    return new Date(Date.now() - ms).toISOString();
  }, [timeRange]);

  const filters: LogFilters = useMemo(
    () => ({
      source: source || undefined,
      status: status || undefined,
      search: search.trim() || undefined,
      since,
      limit: 100,
      offset: 0,
    }),
    [source, status, search, since],
  );

  const { data, isLoading, isError, error } = useLogs(filters);
  const { data: stats } = useLogStats();

  const onStreamEntry = useCallback((entry: ActivityLogEntry) => {
    setStreamEntries((prev) => [entry, ...prev]);
    setEnterIds((prev) => new Set(prev).add(entry.id));
    window.setTimeout(() => {
      setEnterIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }, 400);
  }, []);

  const { isConnected, connect, disconnect } = useLogStream(onStreamEntry);

  useEffect(() => {
    if (liveTail) {
      connect();
    } else {
      disconnect();
      setStreamEntries([]);
    }
  }, [liveTail, connect, disconnect]);

  const rows = useMemo(() => {
    const fetched = data?.entries ?? [];
    const streamIds = new Set(streamEntries.map((e) => e.id));
    const rest = fetched.filter((e) => !streamIds.has(e.id));
    return [...streamEntries, ...rest];
  }, [data?.entries, streamEntries]);

  const topTool = stats?.topTools?.[0]?.action ?? '—';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Activity Logs</h1>
        <p className="mt-1 text-sm text-zinc-500">
          MCP, REST, and hook calls recorded by the Cortex server
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Calls"
          value={stats?.totalEntries ?? '—'}
          icon={ScrollText}
        />
        <StatCard
          label="Avg Latency"
          value={stats != null ? `${Math.round(stats.avgDurationMs)}ms` : '—'}
          icon={Clock}
        />
        <StatCard
          label="Error Rate"
          value={stats != null ? `${(stats.errorRate * 100).toFixed(1)}%` : '—'}
          icon={AlertTriangle}
        />
        <StatCard label="Most Active Tool" value={topTool} icon={Zap} />
      </div>

      <div className="card flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <label className="block min-w-[140px] flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Source
          </span>
          <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All</option>
            <option value="mcp">MCP</option>
            <option value="rest">REST</option>
            <option value="hook">Hook</option>
          </select>
        </label>
        <label className="block min-w-[140px] flex-1">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Status
          </span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label className="block min-w-[200px] flex-2">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Search
          </span>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              className="input pl-9"
              placeholder="Filter by action, repo, error…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </label>
        <div className="flex flex-wrap gap-2">
          <span className="mb-1 w-full text-[11px] font-medium uppercase tracking-wider text-zinc-500 lg:sr-only">
            Time range
          </span>
          {(['1h', '6h', '24h', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={
                timeRange === r
                  ? 'btn-primary text-xs py-1.5 px-3'
                  : 'btn-secondary text-xs py-1.5 px-3'
              }
            >
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setLiveTail((v) => !v)}
            className={
              liveTail
                ? 'btn-primary text-xs py-2 px-4 gap-2'
                : 'btn-secondary text-xs py-2 px-4 gap-2'
            }
          >
            <Radio size={14} className={liveTail ? 'text-emerald-300' : ''} />
            Live tail
            {liveTail && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            {liveTail && (
              <span className="text-[10px] text-emerald-300/90">
                {isConnected ? 'streaming' : 'connecting…'}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-zinc-500">Loading logs…</div>
        ) : isError ? (
          <div className="p-12 text-center text-sm text-red-400">
            {(error as Error)?.message ?? 'Failed to load logs'}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <ScrollText size={48} className="mx-auto mb-4 text-zinc-700" />
            <p className="font-medium text-zinc-300">No activity logs yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Logs appear as agents and tools call the server.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Repo</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const open = expandedId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : entry.id)}
                        className={`cursor-pointer border-b border-zinc-800/80 transition-colors hover:bg-zinc-800/40 ${
                          enterIds.has(entry.id) ? 'log-row-enter' : ''
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-zinc-400">
                          <span title={new Date(entry.timestamp).toLocaleString()}>
                            {formatRelative(entry.timestamp)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`badge ${sourceBadgeClass(entry.source)} capitalize`}
                          >
                            {entry.source}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-zinc-300">
                          {entry.action}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-2.5 font-mono text-xs text-zinc-500">
                          {entry.repoId ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-zinc-400">
                          {formatDuration(entry.durationMs)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`badge capitalize ${statusBadgeClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-zinc-800 bg-zinc-950/50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-medium text-zinc-500">Request</div>
                                <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-800 p-3 font-mono text-xs text-zinc-300">
                                  {JSON.stringify(entry.request, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium text-zinc-500">Response</div>
                                <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-800 p-3 font-mono text-xs text-zinc-300">
                                  {JSON.stringify(entry.response, null, 2)}
                                </pre>
                              </div>
                            </div>
                            {entry.errorMessage && (
                              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                {entry.errorMessage}
                              </div>
                            )}
                            {Object.keys(entry.metadata).length > 0 && (
                              <div className="mt-3">
                                <div className="mb-1 text-xs font-medium text-zinc-500">Metadata</div>
                                <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-800/60 p-3 font-mono text-xs text-zinc-400">
                                  {JSON.stringify(entry.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="border-t border-zinc-800 px-4 py-2 text-center text-[11px] text-zinc-600">
            Showing {rows.length}
            {data?.total != null && data.total > rows.length
              ? ` of ${data.total} matching`
              : ''}{' '}
            entries
          </div>
        )}
      </div>
    </div>
  );
}
