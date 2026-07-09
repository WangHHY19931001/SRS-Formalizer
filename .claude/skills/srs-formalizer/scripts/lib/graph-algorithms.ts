/**
 * Graph algorithms — unified traversal, analysis, and loading utilities.
 *
 * Merged from traversal.ts + graph-traversal.ts (0.5.7 refactor).
 */

import * as fs from 'node:fs';
import { Graph, type GraphNode, type GraphEdge, type GraphData } from './graph.js';

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
