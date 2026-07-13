/**
 * Graph algorithms — unified traversal, analysis, and loading utilities.
 *
 * Merged from traversal.ts + graph-traversal.ts (0.5.7 refactor).
 */

import * as fs from 'node:fs';
import { Graph, type GraphNode, type GraphEdge, type GraphData } from './graph.js';
import type { SRSIR } from '../types/srs-ir.js';
import { tokenize, isAntonymPair, hasNegation, extractCjkBigrams, isMeaningfulBigram } from './text-analysis.js';

// ===========================================================================
// BFS & connectivity
// ===========================================================================

/** BFS 返回从 start 可达的所有节点 id（包含 start 自身）。 */
export function bfs(graph: Graph, start: string): string[] {
  if (!graph.hasNode(start)) return [];
  const visited = new Set<string>();
  const queue: string[] = [start];
  const result: string[] = [];
  visited.add(start);
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of graph.getNeighbors(current)) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
    }
  }
  return result;
}

/** 查找孤立节点：入度 = 0 且 出度 = 0。 */
export function findOrphans(graph: Graph): string[] {
  const orphans: string[] = [];
  for (const node of graph.getAllNodes()) {
    if (graph.getNeighbors(node.id).length === 0 && graph.getIncoming(node.id).length === 0) {
      orphans.push(node.id);
    }
  }
  return orphans;
}

/** 查找悬挂边：边目标节点在图中不存在。 */
export function findDanglingEdges(graph: Graph): { edgeId: string; targetId: string }[] {
  const dangling: { edgeId: string; targetId: string }[] = [];
  for (const edge of graph.getAllEdges()) {
    if (!graph.hasNode(edge.target)) dangling.push({ edgeId: edge.id, targetId: edge.target });
  }
  return dangling;
}

/**
 * 概念孤岛：将图视为无向图进行连通分量检测。
 * 每个连通分量作为一个节点 id 数组返回。孤立节点各自成为一个分量。
 */
export function findConceptIslands(graph: Graph): string[][] {
  const visited = new Set<string>();
  const islands: string[][] = [];
  for (const node of graph.getAllNodes()) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const queue: string[] = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of graph.getNeighbors(current)) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
      for (const predecessor of graph.getIncoming(current)) {
        if (!visited.has(predecessor)) { visited.add(predecessor); queue.push(predecessor); }
      }
    }
    islands.push(component);
  }
  return islands;
}

// ===========================================================================
// Similarity
// ===========================================================================

/** 计算两个集合的 Jaccard 相似度（规范实现——text-analysis 从此处导入）。 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ===========================================================================
// Shortest path (undirected BFS)
// ===========================================================================

/** 两节点间最短路径（无向 BFS：同时遍历出边和入边）。不存在时返回 null。 */
export function findShortestPath(graph: Graph, fromId: string, toId: string): string[] | null {
  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) return null;
  if (fromId === toId) return [fromId];

  const visited = new Set<string>([fromId]);
  const queue: string[][] = [[fromId]];

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const current = currentPath[currentPath.length - 1]!;

    for (const neighbor of graph.getNeighbors(current)) {
      if (neighbor === toId) return [...currentPath, neighbor];
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push([...currentPath, neighbor]); }
    }
    for (const neighbor of graph.getIncoming(current)) {
      if (neighbor === toId) return [...currentPath, neighbor];
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push([...currentPath, neighbor]); }
    }
  }
  return null;
}

// ===========================================================================
// Context extraction (2-hop neighborhood)
// ===========================================================================

/** 获取节点的 2-hop 邻域子图（包含所有相关边）。 */
export function getContext(graph: Graph, id: string): GraphData {
  if (!graph.hasNode(id)) return { nodes: [], edges: [] };

  const oneHopIds = new Set<string>([id]);
  for (const nid of graph.getNeighbors(id)) oneHopIds.add(nid);
  for (const nid of graph.getIncoming(id)) oneHopIds.add(nid);

  const twoHopIds = new Set<string>(oneHopIds);
  for (const nid of oneHopIds) {
    if (nid === id) continue;
    for (const nnid of graph.getNeighbors(nid)) twoHopIds.add(nnid);
    for (const nnid of graph.getIncoming(nid)) twoHopIds.add(nnid);
  }

  const contextNodes: GraphNode[] = [];
  for (const nid of twoHopIds) { const node = graph.getNode(nid); if (node) contextNodes.push(node); }

  const contextNodeIds = new Set(twoHopIds);
  const contextEdges: GraphEdge[] = [];
  for (const edge of graph.getAllEdges()) {
    if (contextNodeIds.has(edge.source) && contextNodeIds.has(edge.target)) contextEdges.push(edge);
  }

  return { nodes: contextNodes, edges: contextEdges };
}

// ===========================================================================
// Node helpers
// ===========================================================================

export function getNodeModule(node: GraphNode): string {
  const mod = node.properties['module'];
  if (typeof mod === 'string' && mod.length > 0) return mod;
  return 'Unknown';
}

export function nodeDetail(node: GraphNode): Record<string, unknown> {
  return { id: node.id, labels: node.labels, properties: { ...node.properties } };
}

export function listModules(graph: Graph): string[] {
  const moduleSet = new Set<string>();
  for (const node of graph.getAllNodes()) moduleSet.add(getNodeModule(node));
  return [...moduleSet].sort();
}

// ===========================================================================
// Graph loading
// ===========================================================================

/** Load a graph from workdir, trying candidates in priority order. */
export function loadGraph(workDir: string, graphDir: string): Graph {
  const candidates = ['graph.merged.json', 'graph.structure_fixed.json', 'graph.json'];
  for (const name of candidates) {
    const filePath = `${workDir}/${graphDir}/${name}`;
    if (fs.existsSync(filePath)) {
      return Graph.fromJSON(JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GraphData);
    }
  }
  throw new Error(`No graph file found in ${graphDir}`);
}

// ===========================================================================
// SRSIR structure analysis (M1)
// ===========================================================================

export function findOrphansFromIR(ir: SRSIR): string[] {
  const incoming = new Set(ir.edges.map(e => e.target));
  const outgoing = new Set(ir.edges.map(e => e.source));
  return ir.nodes.filter(n => !incoming.has(n.id) && !outgoing.has(n.id)).map(n => n.id);
}

export function findDanglingEdgesFromIR(ir: SRSIR): { edgeId: string; targetId: string }[] {
  const nodeIds = new Set(ir.nodes.map(n => n.id));
  return ir.edges.filter(e => !nodeIds.has(e.target)).map(e => ({ edgeId: e.id, targetId: e.target }));
}

export function findConceptIslandsFromIR(ir: SRSIR): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of ir.nodes) adj.set(n.id, []);
  for (const e of ir.edges) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); }
  const visited = new Set<string>();
  const islands: string[][] = [];
  for (const n of ir.nodes) {
    if (visited.has(n.id)) continue;
    const c: string[] = []; const q = [n.id]; visited.add(n.id);
    while (q.length > 0) {
      const id = q.shift()!; c.push(id);
      for (const nb of (adj.get(id) ?? [])) { if (!visited.has(nb)) { visited.add(nb); q.push(nb); } }
    }
    islands.push(c);
  }
  return islands;
}

export function findCrossFileIslands(ir: SRSIR): { islandCount: number; orphanShards: string[]; bridges: { source: string; target: string; reason: string }[] } {
  const islands = findConceptIslandsFromIR(ir);
  const si = new Map<string, number>();
  for (let i = 0; i < islands.length; i++) for (const nid of islands[i]!) {
    si.set(ir.nodes.find(n => n.id === nid)?.source.shardId ?? 'unknown', i);
  }
  const orphanShards = [...si.entries()].filter(([, v]) => v === 1).map(([k]) => k);
  return { islandCount: islands.length, orphanShards, bridges: [] };
}

// ===========================================================================
// SRSIR semantic analysis (M2)
// ===========================================================================

export interface DuplicatePair { pairId: string; nodeA: string; nodeB: string; similarity: number; statementA: string; statementB: string; }
export interface ConflictPair extends DuplicatePair { negationInA: boolean; negationInB: boolean; }
export interface AspectCluster { clusterId: string; object: string; nodes: string[]; statements: string[]; nfrNodes: string[]; }

export function findDuplicatePairsFromIR(ir: SRSIR, threshold = 0.7): DuplicatePair[] {
  const req = ir.nodes.filter(n => n.type === 'requirement');
  const tc = new Map<string, Set<string>>();
  for (const n of req) tc.set(n.id, tokenize(n.properties.statement ?? ''));
  const pairs: DuplicatePair[] = []; let idx = 0;
  for (let i = 0; i < req.length; i++) {
    for (let j = i + 1; j < req.length; j++) {
      const sim = jaccardSimilarity(tc.get(req[i]!.id)!, tc.get(req[j]!.id)!);
      if (sim > threshold) {
        idx++;
        pairs.push({ pairId: `DUP-${String(idx).padStart(3, '0')}`, nodeA: req[i]!.id, nodeB: req[j]!.id, similarity: Math.round(sim * 1000) / 1000, statementA: req[i]!.properties.statement ?? '', statementB: req[j]!.properties.statement ?? '' });
      }
    }
  }
  return pairs;
}

export function findConflictPairsFromIR(ir: SRSIR): ConflictPair[] {
  const req = ir.nodes.filter(n => n.type === 'requirement');
  const tc = new Map<string, Set<string>>();
  for (const n of req) tc.set(n.id, tokenize(n.properties.statement ?? ''));
  const pairs: ConflictPair[] = []; let idx = 0;
  for (let i = 0; i < req.length; i++) {
    for (let j = i + 1; j < req.length; j++) {
      const stA = req[i]!.properties.statement ?? ''; const stB = req[j]!.properties.statement ?? '';
      if (isAntonymPair(stA, stB)) {
        idx++;
        const sim = jaccardSimilarity(tc.get(req[i]!.id)!, tc.get(req[j]!.id)!);
        pairs.push({ pairId: `CON-${String(idx).padStart(3, '0')}`, nodeA: req[i]!.id, nodeB: req[j]!.id, similarity: Math.round(sim * 1000) / 1000, statementA: stA, statementB: stB, negationInA: hasNegation(stA), negationInB: hasNegation(stB) });
      }
    }
  }
  return pairs;
}

export function findSameAspectClustersFromIR(ir: SRSIR, nodeIds: string[]): AspectCluster[] {
  const nMap = new Map<string, (typeof ir.nodes)[number]>();
  for (const n of ir.nodes) nMap.set(n.id, n);
  const bgs = new Map<string, string[]>();
  const stmts = new Map<string, string>();
  for (const nid of nodeIds) {
    const n = nMap.get(nid); if (!n) continue;
    const s = n.properties.statement ?? '';
    stmts.set(nid, s); bgs.set(nid, extractCjkBigrams(s));
  }
  const bn = new Map<string, Set<string>>();
  for (const [nid, blist] of bgs) for (const bg of blist) {
    if (!isMeaningfulBigram(bg)) continue;
    if (!bn.has(bg)) bn.set(bg, new Set()); bn.get(bg)!.add(nid);
  }
  const seen = new Set<string>(); const clusters: AspectCluster[] = [];
  const sorted = [...bn.entries()].filter(([, ids]) => ids.size >= 2).sort((a, b) => b[1].size - a[1].size);
  let ci = 0;
  for (const [bg, bgIds] of sorted) {
    const ids = [...bgIds].filter(id => !seen.has(id));
    if (ids.length >= 2) {
      ci++; for (const id of ids) seen.add(id);
      clusters.push({ clusterId: `ASP-${String(ci).padStart(3, '0')}`, object: bg, nodes: ids, statements: ids.map(id => stmts.get(id) ?? ''), nfrNodes: ids.filter(id => nMap.get(id)?.type === 'nfr') });
    }
  }
  return clusters;
}
