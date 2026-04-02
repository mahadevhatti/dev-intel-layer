import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as d3 from 'd3';
import { useGraph } from '../hooks/useGraph';
import { buildSimulation, getLanguageColor, type SimNode, type SimLink } from '../lib/graph-layout';
import type { GraphNode } from '../lib/api-client';
import { GitGraph, ZoomIn, ZoomOut, Maximize2, Filter } from 'lucide-react';

function NodeDetail({ node }: { node: GraphNode }) {
  return (
    <div className="card mt-4 max-w-md">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: getLanguageColor(node.language) }}
        />
        <span className="font-mono text-sm font-medium text-zinc-200">{node.filePath}</span>
      </div>
      {node.summary && (
        <p className="mb-2 text-sm text-zinc-400">{node.summary}</p>
      )}
      {node.symbols.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium text-zinc-500">
            Symbols ({node.symbols.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {node.symbols.slice(0, 20).map((s, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  s.exported
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {s.kind === 'function' ? 'ƒ' : s.kind === 'class' ? 'C' : s.kind === 'interface' ? 'I' : '•'}{' '}
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {node.responsibilities.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium text-zinc-500">Responsibilities</div>
          <ul className="list-inside list-disc text-xs text-zinc-400">
            {node.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function GraphViewer() {
  const { repoId } = useParams();
  const { data, isLoading } = useGraph(repoId);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string>('all');

  const renderGraph = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return;
    if (data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height - 4;

    svg.attr('width', width).attr('height', height);

    const filteredNodes =
      languageFilter === 'all'
        ? data.nodes
        : data.nodes.filter((n) => n.language === languageFilter);
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
    );

    const { simulation, simNodes, simLinks } = buildSimulation(
      filteredNodes,
      filteredEdges,
      width,
      height,
    );

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 4]).on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoom);

    const link = g
      .append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6);

    const node = g
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => Math.max(6, Math.min(16, 4 + d.symbolCount)))
      .attr('fill', (d) => getLanguageColor(d.language))
      .attr('stroke', '#1a1a2e')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .on('click', (_, d) => {
        const full = data.nodes.find((n) => n.id === d.id);
        setSelectedNode(full ?? null);
      });

    node.append('title').text((d) => d.filePath);

    const label = g
      .append('g')
      .selectAll('text')
      .data(simNodes)
      .join('text')
      .text((d) => {
        const parts = d.filePath.split('/');
        return parts[parts.length - 1];
      })
      .attr('font-size', 10)
      .attr('fill', '#999')
      .attr('dx', 14)
      .attr('dy', 4);

    const drag = d3
      .drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x!)
        .attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!)
        .attr('y2', (d) => (d.target as SimNode).y!);

      node.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!);
      label.attr('x', (d) => d.x!).attr('y', (d) => d.y!);
    });

    return () => simulation.stop();
  }, [data, languageFilter]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center text-zinc-500">
        Loading graph...
      </div>
    );
  }

  const languages = data ? [...new Set(data.nodes.map((n) => n.language))].sort() : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
            <GitGraph size={20} /> Dependency Graph
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {data?.nodes.length ?? 0} nodes · {data?.edges.length ?? 0} edges
          </p>
        </div>
        <div className="flex items-center gap-2">
          {languages.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-zinc-500" />
              <select
                className="select w-auto text-xs"
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
              >
                <option value="all">All languages</option>
                {languages.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {!data || data.nodes.length === 0 ? (
        <div className="card flex h-96 flex-col items-center justify-center">
          <GitGraph size={48} className="mb-3 text-zinc-700" />
          <p className="text-sm text-zinc-400">No graph data yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Run <code className="text-zinc-400">init_kb</code> from an AI agent to build the graph.
          </p>
        </div>
      ) : (
        <>
          <div ref={containerRef} className="card h-[600px] overflow-hidden p-0">
            <svg ref={svgRef} className="h-full w-full" />
          </div>
          {selectedNode && <NodeDetail node={selectedNode} />}
        </>
      )}
    </div>
  );
}
