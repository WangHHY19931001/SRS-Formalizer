/**
 * Cypher export for Lean 4 proof dependency graph.
 */

import { sanitizeId } from '../id-utils.js';
import type { LeanGraph } from './types.js';

export function exportLeanToCypher(graph: LeanGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// Lean 4 Proof Dependency Graph — Neo4j Cypher Export',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Files: ${graph.metadata.file_count}`,
    `// Theorems: ${graph.metadata.theorem_count}`,
    `// Lemmas: ${graph.metadata.lemma_count}`,
    `// Axioms: ${graph.metadata.axiom_count}`,
    `// Imports: ${graph.metadata.import_count}`,
    `// Max proof depth: ${graph.metadata.max_proof_depth}`,
    graph.metadata.axiom_count > 0 ? '// ⚠ WARNING: axioms detected!' : '',
    graph.metadata.sorry_count > 0 ? '// ⚠ WARNING: sorry detected!' : '',
    '// ============================================================',
    '',
  ].filter(l => l !== '');

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
