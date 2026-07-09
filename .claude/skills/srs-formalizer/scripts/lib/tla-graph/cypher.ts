/**
 * Cypher export for TLA+ system interaction graph.
 */

import type { TlaGraph } from './types.js';
import { exportGraphToCypher } from '../cypher.js';

export function exportTlaToCypher(graph: TlaGraph): string {
  return exportGraphToCypher(graph.nodes, graph.edges, {
    title: 'TLA+ System Interaction Graph',
    headerLines: [
      `Generated: ${graph.metadata.generated_at}`,
      `Specs: ${graph.metadata.spec_count}`,
      `Actions: ${graph.metadata.total_actions}`,
      `Invariants: ${graph.metadata.total_invariants}`,
      `Max hierarchy depth: ${graph.metadata.max_hierarchy_depth}`,
    ],
  });
}
