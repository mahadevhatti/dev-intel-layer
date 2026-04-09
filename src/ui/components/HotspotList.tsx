import type { FileMetrics, GraphEdge, GraphNode } from '../lib/api-client';

export interface HotspotRow {
  filePath: string;
  commits90d: number;
  inbound: number;
  risk: number;
}

function computeInboundCount(edges: GraphEdge[], filePath: string, repoId: string): number {
  const nodeId = `${repoId}:${filePath}`;
  return edges.filter((e) => e.target === nodeId).length;
}

export function buildHotspotRows(
  nodes: GraphNode[],
  edges: GraphEdge[],
  metrics: FileMetrics[],
  repoId: string,
): HotspotRow[] {
  const metricByPath = new Map(metrics.map((m) => [m.filePath, m]));
  const rows: HotspotRow[] = nodes.map((n) => {
    const m = metricByPath.get(n.filePath);
    const commits90d = m?.commits90d ?? 0;
    const inbound = computeInboundCount(edges, n.filePath, repoId);
    const risk = commits90d * 2 + inbound * 3;
    return { filePath: n.filePath, commits90d, inbound, risk };
  });
  return rows.sort((a, b) => b.risk - a.risk);
}

export function HotspotList({ rows, maxRows = 25 }: { rows: HotspotRow[]; maxRows?: number }) {
  const shown = rows.slice(0, maxRows);

  if (shown.length === 0) {
    return (
      <div className="card py-8 text-center text-sm text-zinc-500">
        No hotspot data. Enable heatmap and ensure the graph has nodes.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-zinc-800 px-4 py-2.5">
        <h3 className="text-sm font-medium text-zinc-200">Hotspots</h3>
        <p className="text-[11px] text-zinc-500">Ranked by churn (90d commits) and inbound dependencies.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">File</th>
              <th className="px-4 py-2">Commits (90d)</th>
              <th className="px-4 py-2">Inbound edges</th>
              <th className="px-4 py-2">Risk</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.filePath} className="border-b border-zinc-800/60">
                <td className="px-4 py-2 text-xs text-zinc-500">{i + 1}</td>
                <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-zinc-300">{r.filePath}</td>
                <td className="px-4 py-2 text-xs text-zinc-400">{r.commits90d}</td>
                <td className="px-4 py-2 text-xs text-zinc-400">{r.inbound}</td>
                <td className="px-4 py-2 text-xs font-medium text-amber-400/90">{r.risk.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
