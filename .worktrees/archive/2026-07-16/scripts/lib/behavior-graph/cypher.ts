/**
 * Cypher export for BDD behavior graph.
 */

import type { BehaviorGraph } from './types.js';
import { exportGraphToCypher } from '../cypher.js';

export function exportBehaviorToCypher(graph: BehaviorGraph): string {
  return exportGraphToCypher(graph.nodes, graph.edges, {
    title: 'System Behavior Graph',
    headerLines: [
      `Generated: ${graph.metadata.generated_at}`,
      `Features: ${graph.metadata.feature_count}`,
      `Scenarios: ${graph.metadata.scenario_count}`,
      `Actions: ${graph.metadata.action_count}`,
    ],
  });
}
