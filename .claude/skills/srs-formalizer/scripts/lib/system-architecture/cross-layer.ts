/**
 * Cross-layer edge creation — synthesizes edges between domain graphs
 * using VERIFIES links and name-similarity heuristics.
 */

import type { GenericGraph, SynthesisNode, SynthesisEdge } from './types.js';

/** Simple Jaccard-like character overlap for name matching. */
function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a.split(''));
  const bSet = new Set(b.split(''));
  const intersection = new Set([...aSet].filter(x => bSet.has(x)));
  const union = new Set([...aSet, ...bSet]);
  return intersection.size / union.size;
}

export interface CrossLayerInput {
  nodes: SynthesisNode[];
  edges: SynthesisEdge[];
  totalCrossEdges: number;
}

export function addCrossLayerEdges(
  input: CrossLayerInput,
  reqGraph: GenericGraph | null,
  behaviorGraph: GenericGraph | null,
  tlaGraph: GenericGraph | null,
  leanGraph: GenericGraph | null,
): { totalCrossEdges: number } {
  let totalCrossEdges = input.totalCrossEdges;

  // Behavior → Requirement via VERIFIES
  if (behaviorGraph) {
    for (const edge of behaviorGraph.edges) {
      if (edge.type === 'VERIFIES') {
        const reqTarget = reqGraph?.nodes.find(n => n.id === edge.target);
        if (reqTarget) {
          input.edges.push({
            source: `B-${edge.source}`, target: `R-${edge.target}`,
            type: 'IMPLEMENTS', properties: { via: 'VERIFIES' },
          });
          totalCrossEdges++;
        }
      }
    }
  }

  // TLA → Behavior (heuristic: match by module name)
  if (tlaGraph) {
    for (const tNode of tlaGraph.nodes) {
      if (!tNode.labels.includes('System') && !tNode.labels.includes('Action')) continue;
      const tModule = String(tNode.properties.module || tNode.properties.name || '');
      for (const bNode of behaviorGraph?.nodes || []) {
        if (!bNode.labels.includes('Feature')) continue;
        const bModule = String(bNode.properties.module || bNode.properties.name || '');
        if (tModule && bModule && similarity(tModule.toLowerCase(), bModule.toLowerCase()) > 0.6) {
          input.edges.push({
            source: `T-${tNode.id}`, target: `B-${bNode.id}`,
            type: 'FORMALIZES', properties: { match: 'module_name_heuristic' },
          });
          totalCrossEdges++;
        }
      }
    }
  }

  // Lean → TLA (heuristic: theorem names matching invariant names)
  if (leanGraph) {
    for (const lNode of leanGraph.nodes) {
      if (!lNode.labels.includes('Theorem')) continue;
      const lName = String(lNode.properties.name || '');
      for (const tNode of tlaGraph?.nodes || []) {
        if (!tNode.labels.includes('Invariant')) continue;
        const tName = String(tNode.properties.name || '');
        if (lName && tName && similarity(lName.toLowerCase(), tName.toLowerCase()) > 0.5) {
          input.edges.push({
            source: `L-${lNode.id}`, target: `T-${tNode.id}`,
            type: 'PROVES', properties: { match: 'name_heuristic' },
          });
          totalCrossEdges++;
        }
      }
    }
  }

  return { totalCrossEdges };
}
