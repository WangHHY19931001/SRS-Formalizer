/**
 * Cypher export for the system architecture synthesis graph.
 */

import type { SystemArchitectureGraph } from './types.js';

function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function exportSystemArchToCypher(graph: SystemArchitectureGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// System Architecture Graph — Cross-Layer Synthesis',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Iteration: ${graph.metadata.iterations}`,
    `// Nodes: Req=${graph.metadata.requirement_nodes} Bhv=${graph.metadata.behavior_nodes}`,
    `//       TLA=${graph.metadata.tla_nodes} Lean=${graph.metadata.lean_nodes}`,
    `// Cross edges: ${graph.metadata.total_cross_edges}`,
    '//',
  ];

  for (const check of graph.consistency) {
    const icon = check.passed ? '✓' : '✗';
    lines.push(`// ${icon} ${check.name}: ${check.detail}`);
  }

  lines.push('// ============================================================', '');

  for (const node of graph.nodes) {
    const labels = [...node.original_labels, node.layer].map((l: string) => `:${l}`).join('');
    const props = Object.entries(node.properties)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => typeof v === 'string' ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`)
      .join(', ');
    lines.push(`CREATE (${safeId(node.id)}${labels} {id: "${node.id}", layer: "${node.layer}", ${props}});`);
  }

  lines.push('');

  for (const edge of graph.edges) {
    const src = safeId(edge.source);
    const tgt = safeId(edge.target);
    const eProps = edge.properties
      ? Object.entries(edge.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')
      : '';
    const eStr = eProps ? ` {${eProps}}` : '';
    lines.push(`CREATE (${src})-[:${edge.type}${eStr}]->(${tgt});`);
  }

  return lines.join('\n');
}
