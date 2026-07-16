/**
 * Cypher export for the system architecture synthesis graph.
 */

import type { SystemArchitectureGraph, SynthesisNode } from './types.js';
import { exportGraphToCypher } from '../cypher.js';

export function exportSystemArchToCypher(graph: SystemArchitectureGraph): string {
  const headerLines: string[] = [
    `Generated: ${graph.metadata.generated_at}`,
    `Iteration: ${graph.metadata.iterations}`,
    `Nodes: Req=${graph.metadata.requirement_nodes} Bhv=${graph.metadata.behavior_nodes}`,
    `       TLA=${graph.metadata.tla_nodes} Lean=${graph.metadata.lean_nodes}`,
    `Cross edges: ${graph.metadata.total_cross_edges}`,
  ];

  // Consistency checks in header
  for (const check of graph.consistency) {
    headerLines.push(`${check.passed ? '✓' : '✗'} ${check.name}: ${check.detail}`);
  }

  return exportGraphToCypher(
    graph.nodes.map(n => ({ ...n, labels: [...n.original_labels, (n as SynthesisNode).layer] })),
    graph.edges,
    {
      title: 'System Architecture Graph — Cross-Layer Synthesis',
      headerLines,
      nodeExtraFields: (node) => `layer: "${(node as unknown as SynthesisNode).layer}"`,
    },
  );
}
