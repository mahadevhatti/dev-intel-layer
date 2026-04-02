import { useNavigate } from 'react-router-dom';
import { useRepos } from '../hooks/useRepos';
import { useCrossRepoRules } from '../hooks/useRules';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth, fetchRepoStats, type RepoStats } from '../lib/api-client';
import {
  Database,
  GitGraph,
  BookOpen,
  Activity,
  Clock,
  ChevronRight,
} from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-status-${status}`}>{status}</span>;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-400">
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold text-zinc-100">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

function RepoStatsRow({ repoId }: { repoId: string }) {
  const { data } = useQuery<RepoStats>({
    queryKey: ['stats', repoId],
    queryFn: () => fetchRepoStats(repoId),
  });
  if (!data) return <span className="text-zinc-600">—</span>;
  return (
    <span className="text-xs text-zinc-500">
      {data.nodeCount} nodes · {data.edgeCount} edges · {data.ruleCount} rules
    </span>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { data: repos, isLoading } = useRepos();
  const { data: crossRepoRules } = useCrossRepoRules();
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  const totalRepos = repos?.length ?? 0;
  const readyRepos = repos?.filter((r) => r.status === 'ready').length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cross-repo overview of your Developer Intelligence Layer
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Repos" value={totalRepos} icon={Database} />
        <StatCard label="Ready" value={readyRepos} icon={Activity} />
        <StatCard
          label="Cross-Repo Rules"
          value={crossRepoRules?.length ?? 0}
          icon={BookOpen}
        />
        <StatCard
          label="Server Uptime"
          value={health ? `${Math.floor(health.uptime / 60)}m` : '—'}
          icon={Clock}
        />
      </div>

      {/* Repos List */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Registered Repositories</h2>
          <span className="text-xs text-zinc-500">{totalRepos} total</span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-zinc-500">Loading repositories...</div>
        ) : !repos || repos.length === 0 ? (
          <div className="py-12 text-center">
            <Database size={40} className="mx-auto mb-3 text-zinc-700" />
            <p className="text-sm text-zinc-400">No repositories registered yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Connect an AI agent with a <code className="text-zinc-400">repoPath</code> to
              auto-register.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => navigate(`/repos/${repo.id}/graph`)}
                className="flex w-full items-center gap-4 px-2 py-3 text-left transition-colors hover:bg-zinc-800/50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-zinc-400">
                  {repo.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">{repo.name}</span>
                    <StatusBadge status={repo.status} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">{repo.path}</div>
                  <div className="mt-0.5">
                    <RepoStatsRow repoId={repo.id} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {repo.languages.length > 0 && (
                    <div className="flex gap-1">
                      {repo.languages.slice(0, 3).map((lang) => (
                        <span
                          key={lang}
                          className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  )}
                  <ChevronRight size={16} className="text-zinc-600" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cross-Repo Rules */}
      {crossRepoRules && crossRepoRules.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">Cross-Repo Rules</h2>
          <div className="space-y-2">
            {crossRepoRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start gap-3 rounded-lg bg-zinc-800/40 px-3 py-2"
              >
                <span className={`badge badge-${rule.type} mt-0.5`}>{rule.type}</span>
                <span className="text-sm text-zinc-300">{rule.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
