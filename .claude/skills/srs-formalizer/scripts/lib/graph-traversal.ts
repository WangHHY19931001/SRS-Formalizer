/**
 * Graph traversal utilities — BFS shortest path, 2-hop context, and node helpers.
 */

import * as fs from 'node:fs';
import { Graph, type GraphNode, type GraphEdge, type GraphData } from './graph.js';

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

export function findShortestPath(graph: Graph, fromId: string, toId: string): string[] | null {
  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) return null;
  if (fromId === toId) return [fromId];

  const visited = new Set<string>([fromId]);
  const queue: string[][] = [[fromId]];

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const current = currentPath[currentPath.length - 1]!;
    const neighbors = graph.getNeighbors(current);

    for (const neighbor of neighbors) {
      if (neighbor === toId) return [...currentPath, neighbor];
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push([...currentPath, neighbor]); }
    }

    const incoming = graph.getIncoming(current);
    for (const neighbor of incoming) {
      if (neighbor === toId) return [...currentPath, neighbor];
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push([...currentPath, neighbor]); }
    }
  }

  return null;
}

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
