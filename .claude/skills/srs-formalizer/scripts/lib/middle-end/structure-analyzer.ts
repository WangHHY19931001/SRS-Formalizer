import type { SRSIR, IRNode, IREdge } from '../../types/srs-ir.js';

export interface StructureReport {
  orphans: string[];              // 无任何边的节点 ID
  danglingEdges: string[];        // source/target 不存在的边 ID
  conceptIslands: string[][];     // 连通分量中节点数 <3 的孤岛
  crossFileIslands: string[][];   // 所有节点来自同一 source_file 的连通分量
  stats: {
    totalNodes: number;
    totalEdges: number;
    orphanRate: number;
    connectedComponents: number;
  };
}

export function analyzeStructure(ir: SRSIR): StructureReport {
  const orphans = findOrphans(ir.nodes, ir.edges);
  const danglingEdges = findDanglingEdges(ir.nodes, ir.edges);
  const components = findConnectedComponents(ir.nodes, ir.edges);
  const conceptIslands = components.filter(c => c.length < 3 && c.length > 0);
  const crossFileIslands = findCrossFileIslands(ir.nodes, components);
  return {
    orphans,
    danglingEdges,
    conceptIslands,
    crossFileIslands,
    stats: {
      totalNodes: ir.nodes.length,
      totalEdges: ir.edges.length,
      orphanRate: ir.nodes.length > 0 ? orphans.length / ir.nodes.length : 0,
      connectedComponents: components.length,
    },
  };
}

function findOrphans(nodes: IRNode[], edges: IREdge[]): string[] {
  const connected = new Set<string>();
  for (const e of edges) { connected.add(e.source); connected.add(e.target); }
  return nodes.filter(n => !connected.has(n.id)).map(n => n.id);
}

function findDanglingEdges(nodes: IRNode[], edges: IREdge[]): string[] {
  const nodeIds = new Set(nodes.map(n => n.id));
  return edges
    .filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target))
    .map(e => e.id);
}

function findConnectedComponents(nodes: IRNode[], edges: IREdge[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const queue = [n.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const neighbor of adj.get(cur) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(comp);
  }
  return components;
}

function findCrossFileIslands(nodes: IRNode[], components: string[][]): string[][] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  return components.filter(comp => {
    if (comp.length === 0) return false;
    const files = new Set(comp.map(id => nodeMap.get(id)?.source.filePath));
    return files.size === 1; // 所有节点来自同一文件
  });
}
