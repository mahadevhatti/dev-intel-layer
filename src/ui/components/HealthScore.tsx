import { Link, useParams } from 'react-router-dom';
import { Loader2, Lightbulb } from 'lucide-react';
import { useRepoHealth } from '../hooks/useHealth';

function scoreColor(score: number): string {
  if (score >= 70) return '#10b981';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function CircularGauge({ score, size = 72 }: { score: number; size?: number }) {
  const stroke = 5;
  const pad = stroke / 2 + 1;
  const r = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color = scoreColor(score);
  const fontSize = size > 100 ? 32 : size > 64 ? 16 : 11;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgb(39 39 42)"
        strokeWidth={stroke}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <text
        x={cx}
        y={cy + fontSize / 3}
        textAnchor="middle"
        fill="#f4f4f5"
        fontWeight={700}
        style={{ fontSize }}
      >
        {score}
      </text>
    </svg>
  );
}

export function HealthScore({
  variant = 'full',
  repoId: repoIdProp,
}: {
  variant?: 'compact' | 'full';
  repoId?: string;
}) {
  const { repoId: paramId } = useParams();
  const repoId = repoIdProp ?? paramId;
  const q = useRepoHealth(repoId);

  if (variant === 'compact') {
    if (!repoId) return null;
    if (q.isLoading) {
      return (
        <div className="flex h-14 w-14 items-center justify-center text-zinc-500">
          <Loader2 size={18} className="animate-spin" />
        </div>
      );
    }
    if (q.isError || q.data === undefined) {
      return (
        <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-zinc-800/60 text-[10px] text-zinc-500">
          —
        </div>
      );
    }
    const score = q.data.score;
    return (
      <Link
        to={`/repos/${repoId}/health`}
        title={`Knowledge health: ${score}`}
        className="group flex flex-col items-center gap-0.5 rounded-lg p-1 transition-colors hover:bg-zinc-800/80"
      >
        <CircularGauge score={score} size={56} />
        <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-500 group-hover:text-zinc-400">
          Health
        </span>
      </Link>
    );
  }

  if (!repoId) {
    return (
      <div className="card text-center text-zinc-500">
        Select a repository to view health.
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
        <Loader2 className="animate-spin" size={24} />
        <span>Loading health score…</span>
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="card border-red-900/50 text-red-400">
        Failed to load health score. Ensure the server supports repo health scoring.
      </div>
    );
  }

  const { score, breakdown, suggestions } = q.data;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Knowledge health</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Weighted score from graph coverage, freshness, rules, and connectivity
        </p>
      </div>

      <div className="card flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-6">
          <CircularGauge score={score} size={120} />
          <div>
            <div className="text-4xl font-bold tabular-nums" style={{ color: scoreColor(score) }}>
              {score}
            </div>
            <div className="text-sm text-zinc-500">Overall score (0–100)</div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Factors</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2 font-medium">Factor</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="hidden w-48 px-4 py-2 font-medium sm:table-cell">Weight</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((f) => (
              <tr key={f.factor} className="border-b border-zinc-800/80 last:border-0">
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-zinc-200">{f.factor}</div>
                  <div className="mt-2 h-2 w-full max-w-md rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${f.score}%`,
                        backgroundColor: scoreColor(f.score),
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">{f.detail}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-zinc-300">{f.score}</td>
                <td className="hidden px-4 py-3 align-top text-zinc-500 sm:table-cell">{f.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {suggestions.length > 0 && (
        <div className="card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Lightbulb size={16} className="text-amber-400" />
            Suggestions
          </h2>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-400">
                <span className="text-zinc-600">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
