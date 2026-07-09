/**
 * Cypher export for BDD behavior graph.
 */

import { sanitizeId } from '../id-utils.js';
import type { BehaviorGraph } from './types.js';

export function exportBehaviorToCypher(graph: BehaviorGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// System Behavior Graph — Neo4j Cypher Export',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Features: ${graph.metadata.feature_count}`,
    `// Scenarios: ${graph.metadata.scenario_count}`,
    `// Actions: ${graph.metadata.action_count}`,
    '// ============================================================',
    '',
  ];

  // Create nodes
  for (const node of graph.nodes) {
    const labels = node.labels.map(l => `:${l}`).join('');
    const props = Object.entries(node.properties)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`;
        return `${k}: ${v}`;
      })
      .join(', ');
    lines.push(`CREATE (${sanitizeId(node.id)}${labels} {id: "${node.id}", ${props}});`);
  }

  lines.push('');

  // Create edges
  for (const edge of graph.edges) {
    const sourceVar = sanitizeId(edge.source);
    const targetVar = sanitizeId(edge.target);
    const edgeProps = edge.properties
      ? Object.entries(edge.properties)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(', ')
      : '';
    const propsStr = edgeProps ? ` {${edgeProps}}` : '';
    lines.push(`CREATE (${sourceVar})-[:${edge.type}${propsStr}]->(${targetVar});`);
  }

  return lines.join('\n');
}
