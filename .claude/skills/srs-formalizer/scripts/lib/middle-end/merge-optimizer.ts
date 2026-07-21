import type { SRSIR, IREdge } from '../../types/srs-ir.js';
import { analyzeSemantics } from './semantic-analyzer.js';

export function optimizeMerges(ir: SRSIR): SRSIR {
  const semantic = analyzeSemantics(ir);
  const newEdges: IREdge[] = [...ir.edges];

  // 为冲突对添加 conflicts_with 边
  for (const pair of semantic.conflictPairs) {
    const edgeId = `e-${pair.a}-${pair.b}-conflicts_with`;
    if (!newEdges.some(e => e.id === edgeId)) {
      newEdges.push({
        id: edgeId,
        source: pair.a,
        target: pair.b,
        type: 'conflicts_with',
        properties: { reasoning: pair.reason },
      });
    }
  }

  // 为同侧面聚类添加 same_aspect 边
  for (const cluster of semantic.sameAspectClusters) {
    const baseNode = cluster.nodes[0];
    if (!baseNode) continue;
    for (let i = 1; i < cluster.nodes.length; i++) {
      const targetNode = cluster.nodes[i];
      if (!targetNode) continue;
      const edgeId = `e-${baseNode}-${targetNode}-same_aspect`;
      if (!newEdges.some(e => e.id === edgeId)) {
        newEdges.push({
          id: edgeId,
          source: baseNode,
          target: targetNode,
          type: 'same_aspect',
          properties: { reasoning: `same module: ${cluster.module}` },
        });
      }
    }
  }

  return { ...ir, edges: newEdges };
}
