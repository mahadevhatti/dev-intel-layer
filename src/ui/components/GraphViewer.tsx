import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import * as d3 from 'd3';
import { useGraph } from '../hooks/useGraph';
import { buildSimulation, getLanguageColor, type SimNode, type SimLink } from '../lib/graph-layout';
import type { GraphNode, GraphEdge } from '../lib/api-client';
import { GitGraph, ZoomIn, ZoomOut, Maximize2, Filter, Search, X } from 'lucide-react';

const DIRECTORY_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6',
];

function getDirectoryColor(filePath: string, dirMap: Map<string, number>): string {
  const topDir = filePath.split('/').slice(0, 2).join('/');
  if (!dirMap.has(topDir)) {
    dirMap.set(topDir, dirMap.size % DIRECTORY_COLORS.length);
  }
  return DIRECTORY_COLORS[dirMap.get(topDir)!];
}

function NodeDetail({
  node,
  edges,
  onNavigate,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  onNavigate: (nodeId: string) => void;
}) {
  const incomingEdges = edges.filter((e) => e.target === node.id);
  const outgoingEdges = edges.filter((e) => e.source === node.id);

  return (
    <div className="card absolute right-4 top-4 z-10 w-80 max-h-[calc(100%-2rem)] overflow-y-auto shadow-xl border-zinc-700">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: getLanguageColor(node.language) }}
        />
        <span className="font-mono text-sm font-medium text-zinc-200 truncate">{node.filePath}</span>
      </div>

      {node.summary && (
        <p className="mb-3 text-xs text-zinc-400 leading-relaxed">{node.summary}</p>
      )}

      <div className="flex gap-3 mb-3 text-xs">
        <span className="flex items-center gap-1 text-emerald-400">
          <span className="font-semibold">{outgoingEdges.length}</span> imports
        </span>
        <span className="flex items-center gap-1 text-blue-400">
          <span className="font-semibold">{incomingEdges.length}</span> imported by
        </span>
      </div>

      {node.symbols.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Symbols ({node.symbols.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {node.symbols.slice(0, 24).map((s, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  s.exported
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {s.kind === 'function' ? 'ƒ' : s.kind === 'class' ? 'C' : s.kind === 'interface' ? 'I' : s.kind === 'variable' ? 'V' : '•'}{' '}
                {s.name}
              </span>
            ))}
            {node.symbols.length > 24 && (
              <span className="text-[10px] text-zinc-600 px-1.5 py-0.5">+{node.symbols.length - 24} more</span>
            )}
          </div>
        </div>
      )}

      {node.responsibilities.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Responsibilities</div>
          <ul className="list-inside list-disc text-xs text-zinc-400 space-y-0.5">
            {node.responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {outgoingEdges.length > 0 && (
        <div className="mb-2">
          <div className="mb-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Imports</div>
          <div className="space-y-0.5 max-h-28 overflow-y-auto">
            {outgoingEdges.map((e) => (
              <button
                key={e.id}
                onClick={() => onNavigate(e.target)}
                className="block w-full text-left rounded px-2 py-1 font-mono text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 truncate"
              >
                {e.target.split(':')[1]}
              </button>
            ))}
          </div>
        </div>
      )}

      {incomingEdges.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Imported by</div>
          <div className="space-y-0.5 max-h-28 overflow-y-auto">
            {incomingEdges.map((e) => (
              <button
                key={e.id}
                onClick={() => onNavigate(e.source)}
                className="block w-full text-left rounded px-2 py-1 font-mono text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 truncate"
              >
                {e.source.split(':')[1]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({
  languages,
  colorMode,
  dirMap,
}: {
  languages: string[];
  colorMode: 'language' | 'directory';
  dirMap: Map<string, number>;
}) {
  if (colorMode === 'language') {
    return (
      <div className="absolute bottom-4 left-4 z-10 card py-2 px-3 text-[11px] space-y-1 max-w-48">
        <div className="text-zinc-500 font-medium mb-1">Languages</div>
        {languages.map((lang) => (
          <div key={lang} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getLanguageColor(lang) }} />
            <span className="text-zinc-400">{lang}</span>
          </div>
        ))}
        <div className="border-t border-zinc-800 pt-1 mt-1 text-zinc-600">
          Circle size = symbol count
        </div>
      </div>
    );
  }

  const entries = [...dirMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="absolute bottom-4 left-4 z-10 card py-2 px-3 text-[11px] space-y-1 max-w-52 max-h-60 overflow-y-auto">
      <div className="text-zinc-500 font-medium mb-1">Directories</div>
      {entries.map(([dir, idx]) => (
        <div key={dir} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: DIRECTORY_COLORS[idx % DIRECTORY_COLORS.length] }} />
          <span className="text-zinc-400 truncate">{dir}/</span>
        </div>
      ))}
    </div>
  );
}

export function GraphViewer() {
  const { repoId } = useParams();
  const { data, isLoading } = useGraph(repoId);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [colorMode, setColorMode] = useState<'language' | 'directory'>('language');
  const dirMapRef = useRef(new Map<string, number>());

  const searchResults = useMemo(() => {
    if (!data || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return data.nodes.filter((n) => n.filePath.toLowerCase().includes(q)).slice(0, 10);
  }, [data, searchQuery]);

  const filteredData = useMemo(() => {
    if (!data) return null;
    const filteredNodes =
      languageFilter === 'all'
        ? data.nodes
        : data.nodes.filter((n) => n.language === languageFilter);
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
    );
    return { nodes: filteredNodes, edges: filteredEdges };
  }, [data, languageFilter]);

  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.5);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.67);
  }, []);

  const handleZoomReset = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(500).call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);

  const focusNode = useCallback((nodeId: string) => {
    if (!svgRef.current || !zoomRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    const circles = svg.selectAll<SVGCircleElement, SimNode>('circle');
    const target = circles.filter((d) => d.id === nodeId);
    if (target.empty()) return;

    const d = target.datum();
    const rect = containerRef.current.getBoundingClientRect();
    const transform = d3.zoomIdentity
      .translate(rect.width / 2, rect.height / 2)
      .scale(2)
      .translate(-(d.x ?? 0), -(d.y ?? 0));

    svg.transition().duration(500).call(zoomRef.current.transform, transform);

    circles.attr('stroke', '#1a1a2e').attr('stroke-width', 1.5);
    target.attr('stroke', '#f59e0b').attr('stroke-width', 3);

    const full = data?.nodes.find((n) => n.id === nodeId);
    if (full) setSelectedNode(full);
    setSearchQuery('');
    setSearchFocused(false);
  }, [data]);

  const renderGraph = useCallback(() => {
    if (!filteredData || !svgRef.current || !containerRef.current) return;
    if (filteredData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    dirMapRef.current.clear();

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height - 4;

    svg.attr('width', width).attr('height', height);

    const { simulation, simNodes, simLinks } = buildSimulation(
      filteredData.nodes,
      filteredData.edges,
      width,
      height,
    );

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 6]).on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    zoomRef.current = zoom;
    svg.call(zoom);

    const colorFn = (d: SimNode) =>
      colorMode === 'language'
        ? getLanguageColor(d.language)
        : getDirectoryColor(d.filePath, dirMapRef.current);

    const link = g
      .append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5)
      .on('mouseover', function () {
        d3.select(this).attr('stroke', '#6366f1').attr('stroke-width', 2).attr('stroke-opacity', 1);
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke', '#333').attr('stroke-width', 1).attr('stroke-opacity', 0.5);
      });

    link.append('title').text(
      (d) => `${(d.source as SimNode).filePath} → ${(d.target as SimNode).filePath}\n${d.relationship} [${d.symbols.join(', ')}]`,
    );

    const node = g
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => Math.max(5, Math.min(14, 3 + d.symbolCount * 0.8)))
      .attr('fill', colorFn)
      .attr('stroke', '#1a1a2e')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .attr('opacity', 0.9)
      .on('click', function (_, d) {
        const full = filteredData.nodes.find((n) => n.id === d.id);
        setSelectedNode(full ?? null);
        node.attr('stroke', '#1a1a2e').attr('stroke-width', 1.5);
        d3.select(this).attr('stroke', '#f59e0b').attr('stroke-width', 3);
      })
      .on('mouseover', function (_, d) {
        d3.select(this).attr('opacity', 1);
        label.filter((l) => l.id === d.id).attr('fill', '#e4e4e7').attr('font-weight', 600);
      })
      .on('mouseout', function (_, d) {
        d3.select(this).attr('opacity', 0.9);
        label.filter((l) => l.id === d.id).attr('fill', '#71717a').attr('font-weight', 400);
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
      .attr('font-size', 9)
      .attr('fill', '#71717a')
      .attr('dx', 12)
      .attr('dy', 3)
      .attr('pointer-events', 'none');

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
  }, [filteredData, colorMode]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded-lg bg-zinc-800 animate-pulse" />
        <div className="card h-[600px] animate-pulse bg-zinc-800/50" />
      </div>
    );
  }

  const languages = data ? [...new Set(data.nodes.map((n) => n.language))].sort() : [];
  const totalNodes = data?.nodes.length ?? 0;
  const shownNodes = filteredData?.nodes.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
            <GitGraph size={20} /> Dependency Graph
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {languageFilter !== 'all' ? `Showing ${shownNodes} of ${totalNodes} nodes` : `${totalNodes} nodes`}
            {' · '}{data?.edges.length ?? 0} edges
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <div className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5">
              <Search size={13} className="text-zinc-500" />
              <input
                className="bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none w-40"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-zinc-600 hover:text-zinc-400">
                  <X size={12} />
                </button>
              )}
            </div>
            {searchFocused && searchResults.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl max-h-60 overflow-y-auto">
                {searchResults.map((n) => (
                  <button
                    key={n.id}
                    onMouseDown={() => focusNode(n.id)}
                    className="block w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 truncate font-mono"
                  >
                    {n.filePath}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Color mode */}
          <select
            className="select w-auto text-xs"
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as 'language' | 'directory')}
          >
            <option value="language">Color: Language</option>
            <option value="directory">Color: Directory</option>
          </select>

          {/* Language filter */}
          {languages.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-zinc-500" />
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

          {/* Zoom controls */}
          <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-800">
            <button className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors" onClick={handleZoomIn} title="Zoom in">
              <ZoomIn size={14} />
            </button>
            <div className="w-px h-5 bg-zinc-700" />
            <button className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors" onClick={handleZoomOut} title="Zoom out">
              <ZoomOut size={14} />
            </button>
            <div className="w-px h-5 bg-zinc-700" />
            <button className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors" onClick={handleZoomReset} title="Reset view">
              <Maximize2 size={14} />
            </button>
          </div>
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
        <div ref={containerRef} className="card relative h-[600px] overflow-hidden p-0">
          <svg ref={svgRef} className="h-full w-full" />
          <Legend languages={languages} colorMode={colorMode} dirMap={dirMapRef.current} />
          {selectedNode && (
            <NodeDetail
              node={selectedNode}
              edges={data.edges}
              onNavigate={focusNode}
            />
          )}
        </div>
      )}
    </div>
  );
}
