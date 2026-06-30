/**
 * Graph traversal algorithms for SRS formalizer.
 *
 * All functions are pure (no side effects) — they only read from the Graph
 * instance and return computed results without mutating it.
 */

import type { Graph } from './graph.js';

// ---------------------------------------------------------------------------
// bfs
// ---------------------------------------------------------------------------

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
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// findOrphans
// ---------------------------------------------------------------------------

/** 查找孤立节点：入度 = 0 且 出度 = 0。 */
export function findOrphans(graph: Graph): string[] {
  const orphans: string[] = [];

  for (const node of graph.getAllNodes()) {
    const neighbors = graph.getNeighbors(node.id);
    const incoming = graph.getIncoming(node.id);
    if (neighbors.length === 0 && incoming.length === 0) {
      orphans.push(node.id);
    }
  }

  return orphans;
}

// ---------------------------------------------------------------------------
// findDanglingEdges
// ---------------------------------------------------------------------------

/** 查找悬挂边：边目标节点在图中不存在。 */
export function findDanglingEdges(
  graph: Graph
): { edgeId: string; targetId: string }[] {
  const dangling: { edgeId: string; targetId: string }[] = [];

  for (const edge of graph.getAllEdges()) {
    if (!graph.hasNode(edge.target)) {
      dangling.push({ edgeId: edge.id, targetId: edge.target });
    }
  }

  return dangling;
}

// ---------------------------------------------------------------------------
// findConceptIslands
// ---------------------------------------------------------------------------

/**
 * 概念孤岛：将图视为无向图进行连通分量检测。
 *
 * 每个连通分量作为一个节点 id 数组返回。孤立节点各自成为一个分量。
 */
export function findConceptIslands(graph: Graph): string[][] {
  const visited = new Set<string>();
  const islands: string[][] = [];

  for (const node of graph.getAllNodes()) {
    if (visited.has(node.id)) continue;

    // BFS 收集当前连通分量的所有节点（无向视角：同时遍历出边和入边）
    const component: string[] = [];
    const queue: string[] = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const neighbor of graph.getNeighbors(current)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }

      for (const predecessor of graph.getIncoming(current)) {
        if (!visited.has(predecessor)) {
          visited.add(predecessor);
          queue.push(predecessor);
        }
      }
    }

    islands.push(component);
  }

  return islands;
}

// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------

/** 计算两个集合的 Jaccard 相似度。 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ---------------------------------------------------------------------------
// findPath
// ---------------------------------------------------------------------------

/** 两节点间最短路径（BFS）。不存在时返回 null。 */
export function findPath(graph: Graph, from: string, to: string): string[] | null {
  if (from === to) return [from];
  if (!graph.hasNode(from) || !graph.hasNode(to)) return null;

  const visited = new Set<string>();
  const queue: string[] = [from];
  const parent = new Map<string, string>();
  visited.add(from);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const neighbor of graph.getNeighbors(current)) {
      if (visited.has(neighbor)) continue;

      visited.add(neighbor);
      parent.set(neighbor, current);
      if (neighbor === to) {
        return reconstructPath(parent, from, to);
      }
      queue.push(neighbor);
    }
  }

  return null;
}

/** 从 parent 映射重建路径（内部辅助函数）。 */
function reconstructPath(
  parent: Map<string, string>,
  from: string,
  to: string
): string[] {
  const path: string[] = [];
  let current: string | undefined = to;
  while (current !== undefined) {
    path.push(current);
    if (current === from) break;
    current = parent.get(current);
  }
  return path.reverse();
}
