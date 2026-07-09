/**
 * Shared graph mutation operations extracted from merge-analysis and merge-structure.
 */

import { Graph, type GraphEdge } from './graph.js';

// ---------------------------------------------------------------------------
// From merge-analysis: verdict application
// ---------------------------------------------------------------------------

export function applyMergeNodes(
  graph: Graph, nodeA: string, nodeB: string
): { edgesRewired: number; graph: Graph } {
  if (!graph.hasNode(nodeA) || !graph.hasNode(nodeB)) throw new Error(`Cannot merge: node(s) not found (${nodeA}, ${nodeB})`);
  if (nodeA === nodeB) throw new Error(`Cannot merge: nodes are identical (${nodeA})`);

  const currentData = graph.toJSON();
  let edgesRewired = 0;

  const updatedEdges: GraphEdge[] = currentData.edges.map(e => {
    let modified = false;
    let newSource = e.source, newTarget = e.target;
    if (e.source === nodeB) { newSource = nodeA; modified = true; }
    if (e.target === nodeB) { newTarget = nodeA; modified = true; }
    if (modified) {
      edgesRewired++;
      const exists = currentData.edges.some(other => other.source === newSource && other.target === newTarget && other.type === e.type);
      if (exists) return null as unknown as GraphEdge;
      return { ...e, id: `${newSource}--${e.type}--${newTarget}`, source: newSource, target: newTarget };
    }
    return e;
  }).filter((e): e is GraphEdge => e !== null);

  const dedupedEdges = updatedEdges.filter(e => e.source !== e.target);
  const edgeSet = new Set<string>();
  const finalEdges: GraphEdge[] = [];
  for (const e of dedupedEdges) { const key = `${e.source}--${e.type}--${e.target}`; if (!edgeSet.has(key)) { edgeSet.add(key); finalEdges.push(e); } }

  const finalNodes = currentData.nodes.filter(n => n.id !== nodeB);
  return { edgesRewired, graph: Graph.fromJSON({ nodes: finalNodes, edges: finalEdges }) };
}

export function applyAddConflictEdge(graph: Graph, nodeA: string, nodeB: string, reasoning: string): void {
  if (!graph.hasNode(nodeA) || !graph.hasNode(nodeB)) throw new Error(`Cannot add conflict edge: node(s) not found (${nodeA}, ${nodeB})`);
  const edgeId = `${nodeA}--:CONFLICTS_WITH--${nodeB}`;
  if (graph.getAllEdges().some(e => (e.source === nodeA && e.target === nodeB && e.type === ':CONFLICTS_WITH') || (e.source === nodeB && e.target === nodeA && e.type === ':CONFLICTS_WITH'))) return;
  graph.addEdge({ id: edgeId, source: nodeA, target: nodeB, type: ':CONFLICTS_WITH', properties: { reasoning } });
}

export function applyAddSameAspectEdge(graph: Graph, nodeA: string, nodeB: string, reasoning: string): void {
  if (!graph.hasNode(nodeA) || !graph.hasNode(nodeB)) throw new Error(`Cannot add same-aspect edge: node(s) not found (${nodeA}, ${nodeB})`);
  const edgeId = `${nodeA}--:SAME_ASPECT--${nodeB}`;
  if (graph.getAllEdges().some(e => (e.source === nodeA && e.target === nodeB && e.type === ':SAME_ASPECT') || (e.source === nodeB && e.target === nodeA && e.type === ':SAME_ASPECT'))) return;
  graph.addEdge({ id: edgeId, source: nodeA, target: nodeB, type: ':SAME_ASPECT', properties: { reasoning } });
}
