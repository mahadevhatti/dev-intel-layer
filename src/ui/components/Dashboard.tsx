import { useNavigate } from 'react-router-dom';
import { useRepos } from '../hooks/useRepos';
import { useCrossRepoRules } from '../hooks/useRules';
import { useAnalytics } from '../hooks/useAnalytics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchHealth,
  fetchRepoStats,
  fetchManifest,
  buildRepoGraph,
  type RepoStats,
  type RepoInfo,
  type Manifest,
} from '../lib/api-client';
import {
  Database,
  BookOpen,
  Activity,
  Clock,
  Server,
  Layers,
  RefreshCw,
  Eye,
  Copy,
  Check,
  Share2,
  HeartPulse,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { HealthScore } from './HealthScore';

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-status-${status}`}>{status}</span>;
}

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

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-800">
      <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  );
}

function ActivitySparkline({ value, max }: { value: number; max: number }) {
  const n = 14;
  const base = max > 0 ? value / max : 0;
  return (
    <div className="flex items-end gap-px h-5 mt-2" title={`${value} API events (rolling)`}>
      {Array.from({ length: n }, (_, i) => {
        const wave = 0.65 + 0.35 * Math.sin((i / n) * Math.PI * 2);
        const h = Math.max(8, base * wave * 100);
        return (
          <div
            key={i}
            className="flex-1 min-w-0 rounded-sm bg-indigo-500/80"
            style={{ height: `${h}%`, opacity: 0.25 + base * 0.65 }}
          />
        );
      })}
    </div>
  );
}

function ActivityHeatmap({ trend }: { trend: { hour: string; count: number }[] }) {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const { hour: hourKey, count } of trend) {
    const iso = hourKey.length === 13 ? `${hourKey}:00:00.000Z` : hourKey;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const dow = (d.getUTCDay() + 6) % 7;
    const h = d.getUTCHours();
    grid[dow][h] += count;
  }
  let max = 1;
  for (const row of grid) {
    for (const c of row) max = Math.max(max, c);
  }

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Activity (7 days, UTC)</h2>
        <span className="text-[10px] text-zinc-500">Darker = more events</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div
          className="inline-grid gap-px min-w-[520px]"
          style={{
            gridTemplateColumns: `2.25rem repeat(24, minmax(0.55rem, 1fr))`,
          }}
        >
          <div />
          {hours.map((h) => (
            <div key={h} className="text-[8px] text-zinc-600 text-center tabular-nums">
              {h % 6 === 0 ? h : ''}
            </div>
          ))}
          {dayLabels.map((label, di) => (
            <div key={label} className="contents">
              <div className="text-[10px] text-zinc-500 pr-1 flex items-center">{label}</div>
              {grid[di].map((cnt, hi) => (
                <div
                  key={`${di}-${hi}`}
                  title={`${label} ${String(hi).padStart(2, '0')}:00 UTC — ${cnt} events`}
                  className="aspect-square min-h-[12px] rounded-[2px] border border-zinc-800/40"
                  style={{
                    backgroundColor:
                      cnt === 0 ? 'transparent' : `rgba(79, 70, 229, ${0.12 + (cnt / max) * 0.88})`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RepoCard({
  repo,
  onNavigate,
  onBuild,
  isBuilding,
  activityCount,
  maxActivityAcrossRepos,
}: {
  repo: RepoInfo;
  onNavigate: (repoId: string) => void;
  onBuild: (repoId: string) => void;
  isBuilding: boolean;
  activityCount?: number;
  maxActivityAcrossRepos: number;
}) {
  const { data: stats } = useQuery<RepoStats>({
    queryKey: ['stats', repo.id],
    queryFn: () => fetchRepoStats(repo.id),
  });
  const { data: manifest } = useQuery<Manifest | null>({
    queryKey: ['manifest', repo.id],
    queryFn: () => fetchManifest(repo.id),
  });

  const maxStat = Math.max(stats?.nodeCount ?? 0, stats?.edgeCount ?? 0, stats?.ruleCount ?? 0, 1);

  return (
    <div className="card hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-zinc-300 shrink-0">
            {repo.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-200 truncate">{repo.name}</span>
              <StatusBadge status={repo.status} />
            </div>
            <div className="truncate text-xs text-zinc-500 mt-0.5">{repo.path}</div>
          </div>
        </div>
        <div className="flex items-start gap-2 shrink-0">
          <HealthScore variant="compact" repoId={repo.id} />
          <div className="flex flex-wrap justify-end gap-1">
            {repo.languages.map((lang) => (
              <span key={lang} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {lang}
              </span>
            ))}
          </div>
        </div>
      </div>

      {stats && (
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Nodes</span>
            <span className="text-zinc-400 font-mono">{stats.nodeCount}</span>
          </div>
          <MiniBar value={stats.nodeCount} max={maxStat} color="#6366f1" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Edges</span>
            <span className="text-zinc-400 font-mono">{stats.edgeCount}</span>
          </div>
          <MiniBar value={stats.edgeCount} max={maxStat} color="#10b981" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Rules</span>
            <span className="text-zinc-400 font-mono">{stats.ruleCount}</span>
          </div>
          <MiniBar value={stats.ruleCount} max={maxStat} color="#f59e0b" />
        </div>
      )}

      {activityCount !== undefined && (
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
            <span className="text-zinc-500">API activity</span>
            <span className="text-zinc-400 font-mono">{activityCount}</span>
          </div>
          <ActivitySparkline value={activityCount} max={maxActivityAcrossRepos} />
        </div>
      )}

      {manifest && (
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-3">
          <Clock size={11} />
          <span>Synced {new Date(manifest.lastSyncedAt).toLocaleString()}</span>
          <span className="text-zinc-600">·</span>
          <span className="font-mono">{manifest.branchName}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onNavigate(repo.id)}
          className="btn-primary flex-1 text-xs py-1.5"
        >
          <Eye size={12} /> View
        </button>
        <button
          onClick={() => onBuild(repo.id)}
          disabled={isBuilding}
          className="btn-secondary flex-1 text-xs py-1.5"
        >
          <RefreshCw size={12} className={isBuilding ? 'animate-spin' : ''} />
          {isBuilding ? 'Building...' : 'Build Graph'}
        </button>
      </div>
    </div>
  );
}

function CopyableSnippet({ content, label }: { content: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="relative rounded-lg bg-zinc-800 p-3">
        <pre className="text-xs text-zinc-300 overflow-x-auto">{content}</pre>
        <button onClick={copy} className="absolute top-2 right-2 btn-ghost p-1">
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: repos, isLoading } = useRepos();
  const { data: crossRepoRules } = useCrossRepoRules();
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: fetchHealth });
  const { data: analytics } = useAnalytics();
  const [buildingRepo, setBuildingRepo] = useState<string | null>(null);

  const buildMutation = useMutation({
    mutationFn: (repoId: string) => buildRepoGraph(repoId),
    onMutate: (repoId) => setBuildingRepo(repoId),
    onSettled: () => {
      setBuildingRepo(null);
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['manifest'] });
      queryClient.invalidateQueries({ queryKey: ['graph'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const totalRepos = repos?.length ?? 0;
  const readyRepos = repos?.filter((r) => r.status === 'ready').length ?? 0;

  const summaries = analytics?.repoSummaries ?? [];
  const maxRepoActivity = Math.max(1, ...summaries.map((s) => s.activityCount));
  const avgHealth =
    summaries.length > 0
      ? Math.round(summaries.reduce((a, s) => a + s.healthScore, 0) / summaries.length)
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cross-repo overview of your Cortex intelligence server
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Repos" value={totalRepos} icon={Database} />
        <StatCard label="Ready" value={readyRepos} icon={Activity} sublabel={totalRepos > 0 ? `${Math.round((readyRepos / totalRepos) * 100)}%` : undefined} />
        <StatCard label="Cross-Repo Rules" value={crossRepoRules?.length ?? 0} icon={BookOpen} />
        <StatCard
          label="Server Uptime"
          value={health ? formatUptime(health.uptime) : '—'}
          icon={Clock}
          sublabel={health ? `v${health.version}` : undefined}
        />
      </div>

      {/* Cross-repo aggregate analytics */}
      {totalRepos > 0 && analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Nodes" value={analytics.aggregate.totalNodes} icon={Share2} />
          <StatCard label="Total Rules" value={analytics.aggregate.totalRules} icon={BookOpen} />
          <StatCard label="Avg Health Score" value={avgHealth} icon={HeartPulse} />
          <StatCard label="API Activity" value={analytics.aggregate.totalActivity} icon={Zap} />
        </div>
      )}

      {/* Server Info */}
      {health && (
        <div className="card flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Server size={14} className="text-emerald-400" />
            <span className="text-emerald-400 font-medium">Connected</span>
          </div>
          <div className="text-zinc-500">localhost:4170</div>
          <div className="text-zinc-600">~/.cortex/knowledge.db</div>
          <div className="ml-auto text-zinc-500">
            MCP endpoint: <code className="text-zinc-400">http://localhost:4170/mcp</code>
          </div>
        </div>
      )}

      {/* Repos */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="card h-48 animate-pulse bg-zinc-800/50" />
          ))}
        </div>
      ) : !repos || repos.length === 0 ? (
        <div className="card py-12 text-center">
          <Database size={48} className="mx-auto mb-4 text-zinc-700" />
          <p className="text-zinc-300 font-medium">No repositories registered yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Connect an AI agent or use the CLI to get started.
          </p>
          <CopyableSnippet
            label="MCP Configuration (add to your IDE)"
            content={`{
  "mcpServers": {
    "cortex": {
      "url": "http://localhost:4170/mcp"
    }
  }
}`}
          />
          <CopyableSnippet
            label="Or register via CLI"
            content="npx cortex repos add /path/to/your/project"
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Repositories</h2>
            <span className="text-xs text-zinc-500">{totalRepos} total</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {repos.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                onNavigate={(id) => navigate(`/repos/${id}/graph`)}
                onBuild={(id) => buildMutation.mutate(id)}
                isBuilding={buildingRepo === repo.id}
                activityCount={analytics?.repoSummaries.find((s) => s.repoId === repo.id)?.activityCount}
                maxActivityAcrossRepos={maxRepoActivity}
              />
            ))}
          </div>

          {analytics && analytics.activityTrend.length > 0 && (
            <ActivityHeatmap trend={analytics.activityTrend} />
          )}
        </>
      )}

      {/* Cross-Repo Rules */}
      {crossRepoRules && crossRepoRules.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <Layers size={18} /> Cross-Repo Rules
            </h2>
            <span className="text-xs text-zinc-500">{crossRepoRules.length} rules</span>
          </div>
          <div className="space-y-2">
            {crossRepoRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start gap-3 rounded-lg bg-zinc-800/40 px-3 py-2"
              >
                <span className={`badge badge-${rule.type} mt-0.5`}>{rule.type}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-zinc-300">{rule.content}</span>
                  {rule.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {rule.tags.map((tag) => (
                        <span key={tag} className="text-[10px] text-indigo-400 bg-indigo-500/10 rounded px-1.5 py-0.5">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">v{rule.version}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
