/**
 * Cypher export for TLA+ system interaction graph.
 */

import { sanitizeId } from '../id-utils.js';
import type { TlaGraph } from './types.js';

export function exportTlaToCypher(graph: TlaGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// TLA+ System Interaction Graph — Neo4j Cypher Export',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Specs: ${graph.metadata.spec_count}`,
    `// Actions: ${graph.metadata.total_actions}`,
    `// Invariants: ${graph.metadata.total_invariants}`,
    `// Max hierarchy depth: ${graph.metadata.max_hierarchy_depth}`,
    '// ============================================================',
    '',
  ];

  for (const node of graph.nodes) {
    const labels = node.labels.map(l => `:${l}`).join('');
    const props = Object.entries(node.properties)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => typeof v === 'string' ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`)
      .join(', ');
    lines.push(`CREATE (${sanitizeId(node.id)}${labels} {id: "${node.id}", ${props}});`);
  }

  lines.push('');

  for (const edge of graph.edges) {
    const src = sanitizeId(edge.source);
    const tgt = sanitizeId(edge.target);
    const eProps = edge.properties
      ? Object.entries(edge.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')
      : '';
    const eStr = eProps ? ` {${eProps}}` : '';
    lines.push(`CREATE (${src})-[:${edge.type}${eStr}]->(${tgt});`);
  }

  return lines.join('\n');
}
